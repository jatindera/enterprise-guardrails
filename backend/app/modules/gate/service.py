"""Per-domain decisions with verified primary identities and append-only edits."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError
from app.db.models import GateDecisionEvent
from app.modules.arb.service import find_project, has_role, voter_identity, voter_name
from app.modules.gate.schemas import DecisionRecord, GateState, ReviewerState

DOMAINS = {
    "EA": ("enterprise-architect", "assigned_ea"),
    "Security": ("security-engineer", "assigned_security"),
    "RAI": ("rai-manager", "assigned_rai"),
}

def can_edit(project, domain, user):
    oid = voter_identity(user)
    role, field = DOMAINS[domain]
    return oid is not None and (has_role(user, "Admin") or (
        has_role(user, role) and oid == getattr(project, field + "_object_id")
    ))

def combined_status(required, reviewers):
    if not required:
        return "Not required"
    values = [r.saved.decision for r in reviewers if r.current and r.saved]
    if "Rejected" in values:
        return "Rejected"
    if "On hold" in values:
        return "On hold"
    if len(values) != 3:
        return "Awaiting decisions"
    if "Conditional approval" in values:
        return "Conditional approval"
    if all(value == "Approved" for value in values):
        return "Approved"
    return "Not applicable"

def get_state(session, demand_id, user):
    project = find_project(session, demand_id)
    events = list(session.scalars(select(GateDecisionEvent).where(
        GateDecisionEvent.project_id == project.id).order_by(GateDecisionEvent.recorded_at.desc(), GateDecisionEvent.revision.desc())))
    reviewers = []
    for domain, (_, field) in DOMAINS.items():
        event = max((e for e in events if e.domain == domain), key=lambda e: e.revision, default=None)
        name = getattr(project, field)
        current = event is not None and event.primary_object_id == getattr(project, field + "_object_id") and event.reviewer_name == name
        reviewers.append(ReviewerState(domain=domain, reviewer=name, can_edit=can_edit(project, domain, user),
            revision=event.revision if event else 0, current=current,
            saved=DecisionRecord.model_validate(event) if event else None))
    return GateState(required=project.gate_required, project_revision=project.revision,
        can_change_applicability=has_role(user, "Admin") and voter_identity(user) is not None,
        combined_status=combined_status(project.gate_required, reviewers), reviewers=reviewers,
        history=[DecisionRecord.model_validate(e) for e in events])

def save_decision(session, demand_id, domain, data, user):
    with session.begin():
        project = find_project(session, demand_id, lock=True)
        if not can_edit(project, domain, user):
            raise HTTPException(403, "Only the assigned primary reviewer for this domain or Admin may record its decision.")
        if not project.gate_required:
            raise HTTPException(409, "Pre-Production Gate is not required. Admin may change applicability.")
        previous = session.scalar(select(GateDecisionEvent).where(GateDecisionEvent.project_id == project.id,
            GateDecisionEvent.domain == domain).order_by(GateDecisionEvent.revision.desc()).limit(1))
        revision = previous.revision if previous else 0
        if data.expected_revision != revision:
            raise HTTPException(409, "This decision changed. Refresh before editing again.")
        field = DOMAINS[domain][1]
        session.add(GateDecisionEvent(project_id=project.id, domain=domain, revision=revision + 1,
            decision=data.decision, comments=data.comments, primary_object_id=getattr(project, field + "_object_id"),
            reviewer_name=getattr(project, field), actor_object_id=voter_identity(user),
            actor_name=voter_name(user) or "Signed-in reviewer"))
        session.flush()
    return get_state(session, demand_id, user)

def change_applicability(session, demand_id, data, user):
    if not has_role(user, "Admin") or voter_identity(user) is None:
        raise HTTPException(403, "Only Admin may change gate applicability.")
    try:
        with session.begin():
            project = find_project(session, demand_id, lock=True)
            if project.revision != data.expected_revision:
                raise HTTPException(409, "Project changed. Refresh before changing applicability.")
            project.gate_required = data.required
            session.flush()
    except StaleDataError:
        raise HTTPException(409, "Project changed. Refresh before retrying.") from None
    return get_state(session, demand_id, user)
