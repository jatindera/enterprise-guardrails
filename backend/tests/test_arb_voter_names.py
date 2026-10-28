"""Names are trusted identity snapshots; summary data survives new sessions."""
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.models import ARBVote, ARBVoteEvent, ARBVotingRound, Project
from test_project_api import client, database, payload as base_payload


def payload(*args, **kwargs):
    data = base_payload(*args, **kwargs)
    data["markdown"] += "\n- **Architecture Review Board (ARB) Required:** Yes"
    return data



def voter(client, oid, name, roles=None):
    client.app.dependency_overrides[current_user] = lambda: {
        "objectId": str(oid), "name": name, "roles": roles or ["arb-core-team"],
    }


def vote(client, choice, reason=None, revision=0):
    return client.put("/api/projects/3601/arb-vote", json={
        "choice": choice, "reason": reason, "expectedRevision": revision, "roundNumber": 1,
    })


def test_names_and_reasons_survive_another_users_read(client, database):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    ea, security = uuid4(), uuid4()
    voter(client, ea, "Jatinder Arora")
    assert vote(client, "For").status_code == 200
    voter(client, security, "Christina Kelly")
    assert vote(client, "Against", "  Confirm the identity controls.  ").status_code == 200
    voter(client, uuid4(), "Read-only stakeholder", ["general-users"])
    result = client.get("/api/projects/3601/arb-voting")
    assert result.status_code == 200
    data = result.json()
    assert data["total"] == 2 and data["canVote"] is False
    by_name = {row["voterName"]: row for row in data["votes"]}
    assert by_name["Jatinder Arora"]["choice"] == "For"
    assert by_name["Christina Kelly"]["choice"] == "Against"
    assert by_name["Christina Kelly"]["reason"] == "Confirm the identity controls."
    assert by_name["Christina Kelly"]["voterObjectId"] == str(security)
    with Session(database) as session:
        names = set(session.scalars(select(ARBVote.voter_name)))
        history_names = set(session.scalars(select(ARBVoteEvent.voter_name)))
        assert names == history_names == {"Jatinder Arora", "Christina Kelly"}


def test_changed_display_name_updates_snapshot_but_preserves_history(client, database):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    oid = uuid4()
    voter(client, oid, "Original Name")
    assert vote(client, "For").status_code == 200
    voter(client, oid, "Updated Name")
    response = vote(client, "For", revision=1)
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["votes"][0]["voterName"] == "Updated Name"
    assert response.json()["myVote"]["revision"] == 2
    with Session(database) as session:
        events = session.scalars(select(ARBVoteEvent).order_by(ARBVoteEvent.revision)).all()
        assert [row.voter_name for row in events] == ["Original Name", "Updated Name"]


def test_existing_vote_name_is_unknown_until_owner_saves_again(client, database):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    oid = uuid4()
    with Session(database) as session:
        project = session.scalar(select(Project))
        session.add(ARBVotingRound(project_id=project.id, number=1, status="Open"))
        session.flush()
        row = ARBVote(project_id=project.id, voter_object_id=oid, choice="Against", reason="Original reason")
        session.add(row)
        session.flush()
        session.add(ARBVoteEvent(vote_id=row.id, revision=row.revision,
            choice=row.choice, reason=row.reason, recorded_at=row.recorded_at))
        session.commit()
    voter(client, oid, "Known Owner")
    original = client.get("/api/projects/3601/arb-voting").json()
    assert original["votes"][0]["voterName"] is None
    updated = vote(client, "Against", "Original reason", revision=1)
    assert updated.status_code == 200
    assert updated.json()["votes"][0]["voterName"] == "Known Owner"
    assert updated.json()["against"] == updated.json()["total"] == 1
    with Session(database) as session:
        history = session.scalars(select(ARBVoteEvent).order_by(ARBVoteEvent.revision)).all()
        assert [row.voter_name for row in history] == [None, "Known Owner"]


def test_caller_cannot_supply_a_voter_name_in_body(client):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    voter(client, uuid4(), "Actual Voter")
    response = client.put("/api/projects/3601/arb-vote", json={
        "choice": "For", "expectedRevision": 0, "voterName": "Somebody else",
    })
    assert response.status_code == 422


def test_long_unicode_name_is_safely_bounded(client):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    voter(client, uuid4(), "😀" * 200)
    response = vote(client, "For")
    assert response.status_code == 200
    saved = response.json()["votes"][0]["voterName"]
    assert len(saved.encode("utf-16-le")) == 640


def test_missing_name_claim_does_not_erase_a_previously_saved_name(client):
    assert client.post("/api/projects/import", json=payload()).status_code == 201
    oid = uuid4()
    voter(client, oid, "Verified Name")
    assert vote(client, "For").status_code == 200
    voter(client, oid, None)
    result = vote(client, "Against", "Need validation", revision=1)
    assert result.status_code == 200
    assert result.json()["votes"][0]["voterName"] == "Verified Name"
