import logging
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.db.models import Project, ProjectIntakeSnapshot
from app.modules.projects.gate_intake import gate_required_from_intake
from app.modules.projects.arb_intake import arb_required_from_intake
from app.modules.projects.intake_fields import reviewer_from_intake
from app.modules.projects.architect_upn import architect_upn_from_intake, AmbiguousArchitect
from app.modules.projects.security_upn import security_upn_from_intake, AmbiguousSecurity
from app.modules.projects.ea_assignment import _resolve
from app.modules.projects.schemas import (
    ImportProject, IntakeSource, ProjectDetail, ProjectPage, ProjectSummary, UpdateRAIAssignment,
)


def project_detail(session: Session, project: Project) -> ProjectDetail:
    snapshot = session.scalar(
        select(ProjectIntakeSnapshot)
        .where(ProjectIntakeSnapshot.project_id == project.id)
        .order_by(ProjectIntakeSnapshot.imported_at.desc(), ProjectIntakeSnapshot.id.desc())
        .limit(1)
    )
    result = ProjectSummary.model_validate(project).model_dump()
    result["intake_source"] = (
        IntakeSource(
            file_name=snapshot.source_file_name,
            markdown=snapshot.markdown,
            imported_at=snapshot.imported_at,
        ) if snapshot else None
    )
    return ProjectDetail(**result)


def list_projects(session: Session, offset: int, limit: int) -> ProjectPage:
    total = session.scalar(select(func.count()).select_from(Project)) or 0
    projects = session.scalars(
        select(Project)
        .order_by(Project.created_at.desc(), Project.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return ProjectPage(
        items=[ProjectSummary.model_validate(project) for project in projects],
        total=total, offset=offset, limit=limit,
    )


def get_project(session: Session, demand_id: str) -> ProjectDetail:
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project_detail(session, project)


logger = logging.getLogger("guardrails.assignments")

def _try_resolve_import(resolver, upn, domain, demand_id):
    if not upn or resolver is None:
        logger.warning("Identity unresolved for %s reviewer of demand %s: missing email or resolver", domain, demand_id)
        return None
    try:
        return _resolve(resolver, upn)
    except HTTPException as exc:
        logger.warning("Identity unresolved for %s reviewer of demand %s: %s", domain, demand_id, exc.detail)
        return None

def import_project(session: Session, data: ImportProject, resolver=None, default_rai_upn="") -> tuple[ProjectDetail, bool]:
    gate_required = gate_required_from_intake(data.markdown)
    arb_required = arb_required_from_intake(data.markdown)
    ea_from_intake = reviewer_from_intake(data.markdown, "Architect Assigned")
    security_from_intake = reviewer_from_intake(data.markdown, "Security Resource Assigned")
    try:
        architect = architect_upn_from_intake(data.markdown)
    except AmbiguousArchitect:
        raise HTTPException(422, "The intake contains multiple architect emails.") from None
    try:
        security = security_upn_from_intake(data.markdown)
    except AmbiguousSecurity:
        raise HTTPException(422, "The intake contains multiple security reviewer emails.") from None
    # Identity lookup happens before the database transaction. An unresolved
    # identity never grants access; the project can still be imported.
    resolved_ea = _try_resolve_import(resolver, architect.upn, "EA", data.demand_id) if architect.present else None
    resolved_security = _try_resolve_import(resolver, security.upn, "Security", data.demand_id) if security.present else None
    # The configured default applies only to new projects, never overwrites a
    # project-specific RAI assignment during a later reimport.
    resolved_default_rai = _try_resolve_import(resolver, default_rai_upn.strip(), "RAI", data.demand_id) if default_rai_upn.strip() else None
    try:
        # Any failure rolls back BOTH the core change and intake snapshot.
        with session.begin():
            project = session.scalar(select(Project).where(Project.demand_id == data.demand_id)
                .with_hint(Project, "WITH (UPDLOCK, HOLDLOCK)", dialect_name="mssql"))
            created = project is None

            if created:
                if data.expected_revision is not None:
                    raise HTTPException(409, "Project no longer exists. Reload the portfolio.")
            elif data.expected_revision != project.revision:
                raise HTTPException(409, "Project changed. Cancel the import, reload the portfolio, and select the file again.")

            duplicate = session.scalar(select(Project.id).where(
                Project.name == data.name, Project.demand_id != data.demand_id,
            ))
            if duplicate is not None:
                raise HTTPException(409, "This project name belongs to a different Demand ID.")

            if created:
                project = Project(
                    demand_id=data.demand_id, name=data.name, arb_required=arb_required, gate_required=gate_required,
                    business_function=data.business_function or "Not provided",
                    assigned_ea=ea_from_intake if ea_from_intake is not None else (data.assigned_ea or "Not assigned"),
                    assigned_security=security_from_intake or "Not assigned",
                    assigned_rai=default_rai_upn.strip() or "Chris Cawthon",
                    assigned_rai_object_id=resolved_default_rai,
                    assigned_ea_object_id=resolved_ea,
                    assigned_security_object_id=resolved_security,
                )
                session.add(project)
            else:
                project.gate_required = gate_required
                project.arb_required = arb_required  # Latest intake supersedes Admin override.
                project.name = data.name
                if data.business_function is not None:
                    project.business_function = data.business_function
                new_assigned_ea = (
                    ea_from_intake
                    if ea_from_intake is not None
                    else data.assigned_ea
                )

                if new_assigned_ea is not None:
                    if new_assigned_ea.strip().casefold() != project.assigned_ea.strip().casefold():
                        # The previous object ID must not remain attached
                        # to a newly assigned architect.
                        project.assigned_ea_object_id = None

                    project.assigned_ea = new_assigned_ea
                if architect.present:
                    project.assigned_ea_object_id = resolved_ea
                if security_from_intake is not None:
                    # A failed lookup clears any prior binding, rather than retaining stale access.
                    project.assigned_security_object_id = resolved_security
                    project.assigned_security = security_from_intake
                # RAI is managed here by Admin, never replaced by intake.
                # Even identical reimports add a snapshot and advance revision.
                project.revision += 1

            session.flush()
            snapshot = ProjectIntakeSnapshot(
                project_id=project.id,
                source_file_name=data.file_name,
                markdown=data.markdown,
            )
            session.add(snapshot)
            session.flush()

            # Materialize the response while inside the transaction. A commit
            # failure still raises before a success response is returned.
            result = ProjectDetail(
                **ProjectSummary.model_validate(project).model_dump(),
                intake_source=IntakeSource(
                    file_name=snapshot.source_file_name,
                    markdown=snapshot.markdown,
                    imported_at=snapshot.imported_at,
                ),
            )
        return result, created
    except StaleDataError as exc:
        raise HTTPException(409, "Project changed during import. Reload before retrying.") from exc
    except IntegrityError as exc:
        # Handle a uniqueness race without exposing SQL or submitted content.
        message = str(exc.orig)
        if any(code in message for code in ("2601", "2627", "UNIQUE constraint failed")):
            raise HTTPException(409, "Demand ID or project name already exists. Reload the portfolio.") from exc
        raise


def update_rai_assignment(session: Session, demand_id: str, data: UpdateRAIAssignment, resolver=None) -> ProjectDetail:
    # Resolve a changed sign-in email before beginning the transaction.
    upn = data.assigned_rai.strip()
    resolved = _try_resolve_import(resolver, upn, "RAI", demand_id) if "@" in upn else None
    try:
        with session.begin():
            project = session.scalar(select(Project).where(Project.demand_id == demand_id))
            if project is None:
                raise HTTPException(404, "Project not found.")
            if project.revision != data.expected_revision:
                raise HTTPException(409, "Project changed. Cancel editing, return to the portfolio, reload it, and reopen the project before retrying.")
            if project.assigned_rai != data.assigned_rai:
                project.assigned_rai = data.assigned_rai
                project.assigned_rai_object_id = resolved
                session.flush()  # SQLAlchemy version checking also catches concurrent writes.
            result = project_detail(session, project)
        return result
    except StaleDataError as exc:
        raise HTTPException(409, "Project changed while saving. Reload the project before retrying.") from exc


def update_arb_applicability(session, demand_id, data):
    from app.modules.arb.service import find_project
    try:
        with session.begin():
            project = find_project(session, demand_id, lock=True)
            if project.revision != data.expected_revision:
                raise HTTPException(409, "Project changed. Reload before changing ARB applicability.")
            project.arb_required = data.arb_required
            session.flush()
            result = project_detail(session, project)
        return result
    except StaleDataError:
        raise HTTPException(409, "Project changed. Reload before retrying.") from None
