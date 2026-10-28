from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects import mssql
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.db.models import ARBVote, ARBVotingRound, ARBVoteEvent
from test_project_api import client, database, payload as base_payload


def payload(*args, **kwargs):
    data = base_payload(*args, **kwargs)
    data["markdown"] += "\n- **Architecture Review Board (ARB) Required:** Yes"
    return data



def identity(client, roles, oid=None, name="Test admin"):
    oid = oid or uuid4()
    client.app.dependency_overrides[current_user] = lambda: {
        "objectId": str(oid), "name": name, "roles": roles,
    }
    return oid


def create(client):
    assert client.post("/api/projects/import", json=payload()).status_code == 201


def cast(client, choice="For", reason=None, round_number=1, revision=0):
    return client.put("/api/projects/3601/arb-vote", json={
        "choice": choice, "reason": reason, "roundNumber": round_number, "expectedRevision": revision,
    })


def close(client, round_number=1):
    return client.post("/api/projects/3601/arb-voting/close", json={"roundNumber": round_number})


def reopen(client, reason="Revised design", round_number=1):
    return client.post("/api/projects/3601/arb-voting/reopen", json={
        "roundNumber": round_number, "reason": reason,
    })


def test_new_projects_are_open_without_open_action_or_get_mutation(client, database):
    create(client)
    identity(client, ["arb-core-team"])
    result = client.get("/api/projects/3601/arb-voting").json()
    assert result["status"] == "Open" and result["roundNumber"] == 1 and result["canVote"] is True
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ARBVotingRound)) == 0


@pytest.mark.parametrize("roles", [["arb-core-team"], ["enterprise-architect"], ["general-users"]])
def test_only_admin_can_close_or_reopen(client, roles):
    create(client)
    identity(client, roles)
    assert close(client).status_code == 403
    assert reopen(client).status_code == 403


def test_admin_without_core_role_closes_but_does_not_vote(client):
    create(client)
    identity(client, ["arb-core-team"], name="Architect")
    assert cast(client).status_code == 200
    identity(client, ["Admin"], name="Chief Architect")
    assert cast(client).status_code == 403
    data = close(client).json()
    assert data["status"] == "Closed" and data["outcome"] == "Passed"
    assert data["closedByName"] == "Chief Architect" and data["closedAt"]
    assert data["canReopen"] is True and data["canVote"] is False


def test_zero_votes_prevents_closure(client, database):
    create(client)
    identity(client, ["Admin"])
    assert close(client).status_code == 409
    assert client.get("/api/projects/3601/arb-voting").json()["status"] == "Open"


@pytest.mark.parametrize("choices,outcome", [
    (["For"], "Passed"), (["For", "Against"], "Returned for review"),
    (["For", "For", "Against"], "Passed"), (["Against"], "Returned for review"),
])
def test_outcome_uses_submitted_votes_only_after_closure(client, choices, outcome):
    create(client)
    for choice in choices:
        identity(client, ["arb-core-team"])
        result = cast(client, choice, "Concern" if choice == "Against" else None)
        assert result.status_code == 200
        assert result.json()["outcome"] is None  # First favourable vote never closes the round.
    identity(client, ["Admin"])
    data = close(client).json()
    assert data["outcome"] == outcome and data["total"] == len(choices)


def test_closed_votes_are_immutable_even_for_admin_with_core_role(client, database):
    create(client)
    member = identity(client, ["Admin", "arb-core-team"])
    assert cast(client).status_code == 200
    closed = close(client).json()
    assert cast(client, "Against", "Change after closure", revision=1).status_code == 409
    assert cast(client, revision=1).status_code == 409
    assert close(client).json()["closedAt"] == closed["closedAt"]  # Idempotent close.
    identity(client, ["arb-core-team"])
    assert cast(client).status_code == 409
    with Session(database) as session:
        assert session.scalar(select(ARBVote)).choice == "For"
        assert session.scalar(select(func.count()).select_from(ARBVoteEvent)) == 1


def test_reopen_starts_fresh_and_keeps_readonly_previous_round(client, database):
    create(client)
    member = identity(client, ["arb-core-team"], name="Member one")
    assert cast(client, "Against", "Original concern").status_code == 200
    identity(client, ["Admin"], name="Chief Architect")
    assert close(client).status_code == 200
    second = reopen(client, "  Revised architecture submitted  ")
    assert second.status_code == 200
    data = second.json()
    assert data["roundNumber"] == 2 and data["status"] == "Open"
    assert data["total"] == 0 and data["votes"] == [] and data["myVote"] is None
    assert data["reopenReason"] == "Revised architecture submitted"
    assert reopen(client, round_number=1).status_code == 409  # Duplicate request must not create round three.
    identity(client, ["arb-core-team"], oid=member, name="Member one")
    assert cast(client, revision=0).status_code == 409  # A stale round-one browser is blocked.
    assert cast(client, round_number=2, revision=0).status_code == 200
    archived = client.get("/api/projects/3601/arb-voting?roundNumber=1").json()
    assert archived["status"] == "Closed" and archived["outcome"] == "Returned for review"
    assert archived["votes"][0]["reason"] == "Original concern"
    assert not archived["canVote"] and not archived["canClose"] and not archived["canReopen"]
    current = client.get("/api/projects/3601/arb-voting").json()
    assert current["inFavour"] == current["total"] == 1 and len(current["rounds"]) == 2
    with Session(database) as session:
        rows = session.scalars(select(ARBVotingRound).order_by(ARBVotingRound.number)).all()
        assert rows[1].opened_by_name == "Chief Architect"
        assert rows[0].closed_against == 1
        assert session.scalar(select(func.count()).select_from(ARBVote)) == 2


@pytest.mark.parametrize("reason", ["", "   ", "a" * 2001, "😀" * 1001])
def test_reopening_requires_valid_reason(client, reason):
    create(client)
    identity(client, ["Admin"])
    assert reopen(client, reason).status_code == 422


def test_late_admin_actions_cannot_close_or_reopen_newer_round(client):
    create(client)
    identity(client, ["Admin", "arb-core-team"])
    assert cast(client).status_code == 200
    assert close(client).status_code == 200
    assert reopen(client).status_code == 200
    assert close(client, 1).status_code == 409
    assert reopen(client, round_number=2).status_code == 409  # Still open.


def test_sql_server_lock_hint_is_used_for_mutation_project_lookup():
    from app.modules.arb.service import find_project
    class Capture:
        def scalar(self, statement):
            self.statement = statement
            return object()
    session = Capture()
    find_project(session, "3601", lock=True)
    assert "WITH (UPDLOCK, HOLDLOCK)" in str(session.statement.compile(dialect=mssql.dialect()))


def test_close_failure_does_not_partially_lock_round(client, database):
    from sqlalchemy import event
    create(client)
    identity(client, ["Admin", "arb-core-team"])
    assert cast(client).status_code == 200
    def fail(*args):
        raise RuntimeError("Simulated close storage failure")
    event.listen(ARBVotingRound, "before_update", fail)
    try:
        assert close(client).status_code == 500
    finally:
        event.remove(ARBVotingRound, "before_update", fail)
    with Session(database) as session:
        row = session.scalar(select(ARBVotingRound))
        assert row.status == "Open" and row.closed_at is None and row.outcome is None


def test_reopen_failure_keeps_previous_round_closed(client, database):
    from sqlalchemy import event
    create(client)
    identity(client, ["Admin", "arb-core-team"])
    assert cast(client).status_code == 200
    assert close(client).status_code == 200
    def fail(*args):
        raise RuntimeError("Simulated reopen storage failure")
    event.listen(ARBVotingRound, "before_insert", fail)
    try:
        assert reopen(client).status_code == 500
    finally:
        event.remove(ARBVotingRound, "before_insert", fail)
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ARBVotingRound)) == 1
        assert session.scalar(select(ARBVotingRound)).status == "Closed"
        assert session.scalar(select(func.count()).select_from(ARBVote)) == 1
