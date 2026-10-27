"""RAI assignment operations. Only trusted Entra object IDs grant access."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError
from app.db.models import Project, ProjectIntakeSnapshot
from app.modules.projects.rai_access import rai_permissions
from app.modules.projects.graph_identity import IdentityNotFound, IdentityLookupUnavailable


def _project(session, demand_id):
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def _revision(project, expected):
    if project.revision != expected:
        raise HTTPException(409, "Project changed. Reload before retrying.")


def _resolve(resolver, upn):
    try:
        return resolver(upn).object_id
    except ValueError:
        raise HTTPException(422, "Enter a valid sign-in email.") from None
    except IdentityNotFound:
        raise HTTPException(422, "The sign-in email was not found in the directory.") from None
    except IdentityLookupUnavailable:
        raise HTTPException(503, "Directory lookup is unavailable. Try again later.") from None


def _view(project, user):
    edit, manage = rai_permissions(user, project.assigned_rai_object_id, project.additional_rai_object_id)
    return {"canEdit": edit, "canManageAdditional": manage, "canClose": manage,
            "additionalEmail": project.additional_rai_email, "revision": project.revision,
            "primaryResolved": project.assigned_rai_object_id is not None}


def get_rai_access(session, demand_id, user):
    return _view(_project(session, demand_id), user)


def resolve_primary(session, demand_id, expected_revision, user, resolver):
    if "Admin" not in user["roles"]:
        raise HTTPException(403, "Administrator access is required.")
    # Capture the exact snapshot while checking the revision. Do not hold a DB
    # transaction open during the remote directory call.
    with session.begin():
        project = _project(session, demand_id)
        _revision(project, expected_revision)
        upn = project.assigned_rai.strip()
        if "@" not in upn:
            raise HTTPException(422, "Set the assigned RAI reviewer to their sign-in email in project details first.")
    oid = _resolve(resolver, upn)
    try:
        with session.begin():
            project = _project(session, demand_id)
            _revision(project, expected_revision)
            project.assigned_rai_object_id = oid
            # Advance even if the resolved identity is already the same.
            project.revision += 1
            session.flush()
            result = _view(project, user)
        return result
    except StaleDataError:
        raise HTTPException(409, "Project changed. Reload before retrying.") from None


def set_additional(session, demand_id, expected_revision, user, email, resolver):
    with session.begin():
        project = _project(session, demand_id)
        _revision(project, expected_revision)
        if not rai_permissions(user, project.assigned_rai_object_id, project.additional_rai_object_id)[1]:
            raise HTTPException(403, "Only the primary rai reviewer or an administrator may manage the additional rai reviewer.")
    upn = email.strip() if email else None
    oid = _resolve(resolver, upn) if upn else None
    try:
        with session.begin():
            project = _project(session, demand_id)
            _revision(project, expected_revision)
            # Re-check after the remote call to prevent assignment races.
            if not rai_permissions(user, project.assigned_rai_object_id, project.additional_rai_object_id)[1]:
                raise HTTPException(403, "You can no longer manage this assignment.")
            project.additional_rai_email = upn
            project.additional_rai_object_id = oid
            project.revision += 1
            session.flush()
            result = _view(project, user)
        return result
    except StaleDataError:
        raise HTTPException(409, "Project changed. Reload before retrying.") from None
