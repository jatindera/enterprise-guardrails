"""Read assignment evidence from structured fields; directory lookup still verifies identity."""
from fastapi import HTTPException
from sqlalchemy import select
from app.db.models import ProjectIntakeSnapshot, ProjectIntakeField
from app.modules.intake.parser import normalized
from app.modules.projects.architect_upn import _EMAIL


def primary_reviewer_upn(session, project, domain):
    label, fallback, description = {
        "ea": ("Architect Assigned", project.assigned_ea, "architect"),
        "security": ("Security Resource Assigned", project.assigned_security, "security reviewer"),
    }[domain]
    snapshot_id = session.scalar(select(ProjectIntakeSnapshot.id)
        .where(ProjectIntakeSnapshot.project_id == project.id)
        .order_by(ProjectIntakeSnapshot.imported_at.desc(), ProjectIntakeSnapshot.id.desc()).limit(1))
    fields = session.scalars(select(ProjectIntakeField).where(
        ProjectIntakeField.snapshot_id == snapshot_id)).all() if snapshot_id else []
    values = [field.value for field in fields if normalized(field.field_name) == normalized(label)]
    # Missing fields preserve the existing assignment. A present blank field must
    # never accidentally resolve the previous person's identity.
    if len(values) > 1:
        raise HTTPException(422, f"The intake contains multiple {description} fields.")
    emails = {match.group(0).casefold() for match in _EMAIL.finditer(values[0] if values else fallback)}
    if len(emails) > 1:
        raise HTTPException(422, f"The intake contains multiple {description} emails.")
    return next(iter(emails), None)
