"""Record deployment information; this does not execute an Azure deployment."""
import json
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError
from app.db.models import ProductionDeploymentEvent, utc_now
from app.modules.arb.service import find_project, voter_identity, voter_name
from app.modules.gate.service import get_state as get_gate, can_edit, DOMAINS, PRODUCTION_PERMITTING_DECISIONS
from app.modules.production.schemas import DeploymentHistory, DeploymentState


def allowed(project, user):
    return any(can_edit(project, domain, user) for domain in DOMAINS)


def approval_check(gate):
    failures = []
    for reviewer in gate.reviewers:
        if reviewer.saved is None:
            failures.append(f"{reviewer.domain}: no gate decision recorded")
        elif not reviewer.current:
            failures.append(f"{reviewer.domain}: gate decision needs reconfirmation after reassignment")
        elif reviewer.saved.decision not in PRODUCTION_PERMITTING_DECISIONS:
            failures.append(f"{reviewer.domain}: {reviewer.saved.decision}")
    if not failures:
        return None
    prefix = "In production requires completed EA, Security, and RAI gate decisions of Approved, Conditional approval, or Not applicable. "
    if not gate.required:
        prefix += "Marking the gate not required does not bypass this requirement. "
    return prefix + "; ".join(failures) + "."


def get_state(session, demand_id, user):
    project = find_project(session, demand_id)
    gate = get_gate(session, demand_id, user)
    blocker = approval_check(gate)
    history = session.scalars(select(ProductionDeploymentEvent).where(
        ProductionDeploymentEvent.project_id == project.id).order_by(ProductionDeploymentEvent.revision.desc())).all()
    return DeploymentState(production_status=project.production_status, go_live_date=project.go_live_date,
        comments=project.production_comments, saved_at=project.production_saved_at, saved_by=project.production_saved_by,
        revision=project.production_revision, project_revision=project.revision,
        can_submit=allowed(project, user), can_mark_in_production=blocker is None, blocker=blocker,
        history=[DeploymentHistory.model_validate(row) for row in history])


def submit(session, demand_id, data, user):
    try:
        with session.begin():
            # Gate edits, reassignment and this write use the same project row.
            # The current DB decisions, not client-supplied flags, authorize go-live.
            project = find_project(session, demand_id, lock=True)
            if not allowed(project, user):
                raise HTTPException(403, "Only an assigned primary EA, Security or RAI reviewer, or Admin, may submit deployment results.")
            if data.expected_revision != project.production_revision:
                raise HTTPException(409, "Deployment results changed. Reload the saved values before submitting again.")
            gate = get_gate(session, demand_id, user)
            if data.production_status == "In production":
                blocker = approval_check(gate)
                if blocker:
                    raise HTTPException(409, blocker)
            if (project.production_revision > 0 and project.production_status == data.production_status
                    and project.go_live_date == data.go_live_date and project.production_comments == data.comments):
                return get_state(session, demand_id, user)
            recorded_at = utc_now()
            actor_name = voter_name(user) or "Signed-in reviewer"
            project.production_status = data.production_status
            project.go_live_date = data.go_live_date
            project.production_comments = data.comments
            project.production_saved_at = recorded_at
            project.production_saved_by = actor_name
            project.production_revision += 1
            snapshot = [{"domain": reviewer.domain, "decisionId": str(reviewer.saved.id),
                "revision": reviewer.saved.revision, "decision": reviewer.saved.decision}
                for reviewer in gate.reviewers if reviewer.current and reviewer.saved]
            session.add(ProductionDeploymentEvent(project_id=project.id, revision=project.production_revision,
                production_status=data.production_status, go_live_date=data.go_live_date, comments=data.comments,
                actor_object_id=voter_identity(user), actor_name=actor_name, recorded_at=recorded_at,
                gate_approval_snapshot=json.dumps(snapshot)))
            session.flush()
        return get_state(session, demand_id, user)
    except StaleDataError:
        raise HTTPException(409, "Project changed during submission. Reload before retrying.") from None
