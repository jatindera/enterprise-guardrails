"""Persist and read source-independent structured intake versions."""
import json
from fastapi import HTTPException
from sqlalchemy import select
from app.db.models import Project, ProjectIntakeSnapshot, ProjectIntakeDetail, ProjectIntakeField, ProjectIntakeStakeholder
from app.modules.intake.fields import PARSER_VERSION
from app.modules.intake.parser import normalized
from app.modules.intake.schemas import IntakeContext, IntakeFacts, IntakeField, IntakeStakeholder, IntakeVersion


def store_context(session, snapshot, parsed):
    """Caller controls the transaction. Never rewrite an existing import version."""
    if session.get(ProjectIntakeDetail, snapshot.id) is not None:
        return False
    session.add(ProjectIntakeDetail(snapshot_id=snapshot.id, parser_version=PARSER_VERSION,
        parsing_warnings=json.dumps(parsed.warnings), **parsed.facts))
    session.add_all(ProjectIntakeField(snapshot_id=snapshot.id, **entry) for entry in parsed.fields)
    session.add_all(ProjectIntakeStakeholder(snapshot_id=snapshot.id, ordinal=n, **entry)
        for n, entry in enumerate(parsed.stakeholders))
    session.flush()
    return True


def version_summary(snapshot, structured):
    return IntakeVersion(snapshot_id=snapshot.id, source_system=snapshot.source_system,
        source_item_id=snapshot.source_item_id, source_url=snapshot.source_url,
        source_modified_at=snapshot.source_modified_at, source_etag=snapshot.source_etag,
        source_file_name=snapshot.source_file_name, imported_at=snapshot.imported_at, structured=structured)


def context_for_snapshot(session, snapshot):
    details = session.get(ProjectIntakeDetail, snapshot.id)
    if details is None:
        return None
    fields = session.scalars(select(ProjectIntakeField).where(ProjectIntakeField.snapshot_id == snapshot.id)
        .order_by(ProjectIntakeField.ordinal)).all()
    people = session.scalars(select(ProjectIntakeStakeholder).where(ProjectIntakeStakeholder.snapshot_id == snapshot.id)
        .order_by(ProjectIntakeStakeholder.ordinal)).all()
    source = [IntakeField.model_validate(entry) for entry in fields]
    return IntakeContext(version=version_summary(snapshot, True), facts=IntakeFacts.model_validate(details),
        stakeholders=[IntakeStakeholder.model_validate(person) for person in people], source_fields=source,
        comments=[entry for entry in source if normalized(entry.field_name) == "comments"],
        parsing_warnings=json.loads(details.parsing_warnings))


def find_snapshot(session, demand_id, snapshot_id=None):
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, "Project not found.")
    query = select(ProjectIntakeSnapshot).where(ProjectIntakeSnapshot.project_id == project.id)
    if snapshot_id is not None:
        query = query.where(ProjectIntakeSnapshot.id == snapshot_id)
    snapshot = session.scalar(query.order_by(ProjectIntakeSnapshot.imported_at.desc(), ProjectIntakeSnapshot.id.desc()).limit(1))
    if snapshot is None:
        raise HTTPException(404, "Intake version not found.")
    return snapshot


def get_context(session, demand_id, snapshot_id=None):
    snapshot = find_snapshot(session, demand_id, snapshot_id)
    result = context_for_snapshot(session, snapshot)
    if result is None:
        raise HTTPException(409, "This intake version has no structured data. Ask an administrator to restore it from its source.")
    return result


def list_versions(session, demand_id):
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, "Project not found.")
    rows = session.execute(select(ProjectIntakeSnapshot, ProjectIntakeDetail.snapshot_id)
        .outerjoin(ProjectIntakeDetail, ProjectIntakeDetail.snapshot_id == ProjectIntakeSnapshot.id)
        .where(ProjectIntakeSnapshot.project_id == project.id)
        .order_by(ProjectIntakeSnapshot.imported_at.desc(), ProjectIntakeSnapshot.id.desc())).all()
    return [version_summary(snapshot, details_id is not None) for snapshot, details_id in rows]
