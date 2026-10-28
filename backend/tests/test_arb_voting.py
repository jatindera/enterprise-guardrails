"""Voting authorization, persistence, validation, optimistic locking and audit."""
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.core.auth import current_user
from app.db.models import ARBVote, ARBVoteEvent, ARBVotingRound, Project
from test_project_api import client, database, payload as base_payload


def payload(*args, **kwargs):
    data = base_payload(*args, **kwargs)
    data["markdown"] += "\n- **Architecture Review Board (ARB) Required:** Yes"
    return data



def set_user(client, oid, roles):
    client.app.dependency_overrides[current_user] = lambda: {
        "objectId": str(oid), "roles": roles, "name": "Test voter",
    }


def create_project(client):
    assert client.post("/api/projects/import", json=payload()).status_code == 201


def put_vote(client, choice="For", reason=None, revision=0):
    return client.put("/api/projects/3601/arb-vote", json={
        "choice": choice, "reason": reason, "expectedRevision": revision, "roundNumber": 1,
    })


@pytest.mark.parametrize("roles", [
    ["Admin"], ["enterprise-architect"], ["security-engineer"], ["rai-manager"],
    ["general-users"], ["Admin", "enterprise-architect"],
])
def test_non_core_cannot_vote_but_can_read(client, database, roles):
    create_project(client)
    set_user(client, uuid4(), roles)
    response = put_vote(client)
    assert response.status_code == 403
    result = client.get("/api/projects/3601/arb-voting").json()
    assert {k: result[k] for k in ("inFavour", "against", "total", "canVote", "myVote", "votes")} == {"inFavour": 0, "against": 0, "total": 0, "canVote": False, "myVote": None, "votes": []}
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ARBVote)) == 0
        assert session.scalar(select(func.count()).select_from(ARBVoteEvent)) == 0


def test_core_member_without_ea_role_can_vote_and_result_survives_new_request(client, database):
    create_project(client)
    oid = uuid4()
    set_user(client, oid, ["arb-core-team"])
    response = put_vote(client)
    assert response.status_code == 200
    result = response.json()
    assert result["inFavour"] == result["total"] == 1
    assert result["against"] == 0 and result["canVote"] is True
    assert result["myVote"]["revision"] == 1
    assert result["myVote"]["recordedAt"].endswith(("Z", "+00:00"))
    saved = client.get("/api/projects/3601/arb-voting").json()
    assert saved == result
    with Session(database) as session:
        vote = session.scalar(select(ARBVote))
        assert vote.voter_object_id == oid
        assert session.scalar(select(ARBVoteEvent)).revision == 1
        # Voting does not mutate the project's assessment or assignment revision.
        assert session.scalar(select(Project)).revision == 1


def test_admin_with_core_role_can_vote(client):
    create_project(client)
    set_user(client, uuid4(), ["Admin", "arb-core-team"])
    assert put_vote(client).status_code == 200


@pytest.mark.parametrize("body", [
    {"choice": "Against", "reason": None, "expectedRevision": 0},
    {"choice": "Against", "reason": " \n ", "expectedRevision": 0},
    {"choice": "Against", "reason": "a" * 2001, "expectedRevision": 0},
    {"choice": "Against", "reason": "😀" * 1001, "expectedRevision": 0},
    {"choice": "Abstain", "expectedRevision": 0},
    {"choice": "For", "expectedRevision": -1},
    {"choice": "For", "expectedRevision": True},
    {"choice": "For", "voterObjectId": str(uuid4()), "expectedRevision": 0},
    {"choice": "For", "recordedAt": "2000-01-01", "expectedRevision": 0},
    {"choice": "For"},
])
def test_invalid_submission_is_rejected(client, body):
    create_project(client)
    set_user(client, uuid4(), ["arb-core-team"])
    assert client.put("/api/projects/3601/arb-vote", json=body).status_code == 422
    assert client.get("/api/projects/3601/arb-voting").json()["total"] == 0


def test_change_vote_keeps_one_current_vote_and_retains_prior_reason(client, database):
    create_project(client)
    set_user(client, uuid4(), ["arb-core-team"])
    first = put_vote(client, "Against", "  Missing controls  ")
    assert first.status_code == 200
    assert first.json()["myVote"]["reason"] == "Missing controls"
    updated = put_vote(client, "For", revision=1)
    assert updated.status_code == 200
    result = updated.json()
    assert result["myVote"]["reason"] is None
    assert result["myVote"]["revision"] == 2
    assert (result["inFavour"], result["against"], result["total"]) == (1, 0, 1)
    with Session(database) as session:
        history = session.scalars(select(ARBVoteEvent).order_by(ARBVoteEvent.revision)).all()
        assert [(x.choice, x.reason) for x in history] == [
            ("Against", "Missing controls"), ("For", None)]


def test_duplicate_click_and_stale_tab_do_not_double_count(client, database):
    create_project(client)
    set_user(client, uuid4(), ["arb-core-team"])
    assert put_vote(client).status_code == 200
    assert put_vote(client).status_code == 409
    assert put_vote(client, revision=1).status_code == 200
    assert put_vote(client, "Against", "New reason", revision=0).status_code == 409
    assert client.get("/api/projects/3601/arb-voting").json()["total"] == 1
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ARBVoteEvent)) == 1


def test_counts_separate_members_and_projects_and_roles_remain_independent(client):
    create_project(client)
    assert client.post("/api/projects/import", json=payload(demand_id="3602", name="Other project")).status_code == 201
    first, second = uuid4(), uuid4()
    set_user(client, first, ["arb-core-team"])
    put_vote(client)
    set_user(client, second, ["arb-core-team"])
    put_vote(client, "Against", "Need design clarification")
    assert client.get("/api/projects/3601/arb-voting").json()["total"] == 2
    assert client.get("/api/projects/3602/arb-voting").json()["total"] == 0
    set_user(client, first, ["enterprise-architect"])
    result = client.get("/api/projects/3601/arb-voting").json()
    assert result["canVote"] is False and result["myVote"]["choice"] == "For"
    assert put_vote(client, "Against", "Attempt", revision=1).status_code == 403


def test_missing_project_invalid_identity_and_unauthenticated_requests(client):
    create_project(client)
    set_user(client, uuid4(), ["arb-core-team"])
    assert client.get("/api/projects/9999/arb-voting").status_code == 404
    assert client.put("/api/projects/9999/arb-vote", json={"choice": "For", "expectedRevision": 0, "roundNumber": 1}).status_code == 404
    set_user(client, "not-a-uuid", ["arb-core-team"])
    assert put_vote(client).status_code == 401
    del client.app.dependency_overrides[current_user]
    assert client.get("/api/projects/3601/arb-voting").status_code == 401
    assert put_vote(client).status_code == 401


def test_audit_insert_failure_rolls_back_vote(client, database):
    create_project(client)
    set_user(client, uuid4(), ["arb-core-team"])
    def fail(*args):
        raise RuntimeError("Simulated audit storage failure")
    event.listen(ARBVoteEvent, "before_insert", fail)
    try:
        assert put_vote(client).status_code == 500
    finally:
        event.remove(ARBVoteEvent, "before_insert", fail)
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ARBVote)) == 0


def test_sqlalchemy_revision_prevents_overwriting_concurrent_vote(database):
    from app.db.models import utc_now
    with Session(database) as seed:
        project = Project(demand_id="3601", name="Concurrency", business_function="IT", assigned_ea="EA")
        seed.add(project)
        seed.flush()
        seed.add(ARBVotingRound(project_id=project.id, number=1, status="Open"))
        seed.flush()
        vote = ARBVote(project_id=project.id, voter_object_id=uuid4(), choice="For", recorded_at=utc_now())
        seed.add(vote)
        seed.commit()
        vote_id = vote.id
    with Session(database) as first, Session(database) as second:
        one, two = first.get(ARBVote, vote_id), second.get(ARBVote, vote_id)
        one.choice = "Against"
        one.reason = "First writer"
        first.commit()
        two.choice = "Against"
        two.reason = "Stale writer"
        with pytest.raises(StaleDataError):
            second.commit()
