from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.models import ProjectIntakeSnapshot
from app.modules.projects.intake_fields import reviewer_from_intake
from test_project_api import client, database, payload


@pytest.mark.parametrize("markdown,expected", [
    ("| Security Resource Assigned | Christina Kelly |", "Christina Kelly"),
    ("- **Security Resource Assigned:** [Christina Kelly](mailto:ck@example.com)", "Christina Kelly"),
    ("| SECURITY RESOURCE ASSIGNED | Christina Kelly |", "Christina Kelly"),
    ("| Security Resource Assigned | Not provided (placeholder: Find items) |", "Not assigned"),
    ("| Security Resource Assigned | |", "Not assigned"),
    ("# No reviewer field", None),
])
def test_intake_reviewer_formats(markdown, expected):
    assert reviewer_from_intake(markdown, "Security Resource Assigned") == expected


def test_sample_import_defaults_and_reviewers(client):
    markdown = (Path(__file__).parent / "fixtures/sample_intake.md").read_text(encoding="utf-8")
    response = client.post("/api/projects/import", json=payload(
        demand_id="3845", name="Agent 365 SDK POV", markdown=markdown,
        assignedEa="This must not override the explicit intake placeholder",
    ))
    assert response.status_code == 201
    result = response.json()
    assert result["assignedSecurity"] == "Christina Kelly"
    assert result["assignedEa"] == "Not assigned"
    assert result["assignedRai"] == "Chris Cawthon"
    assert client.get("/api/projects/3845").json()["assignedSecurity"] == "Christina Kelly"
    assert client.get("/api/projects").json()["items"][0]["assignedRai"] == "Chris Cawthon"


def test_rai_save_and_reimport_preserves_rai(client, database):
    first = client.post("/api/projects/import", json=payload()).json()
    response = client.patch("/api/projects/3601/rai-assignment", json={
        "assignedRai": "  Future RAI Manager  ", "expectedRevision": first["revision"],
    })
    assert response.status_code == 200
    saved = response.json()
    assert saved["assignedRai"] == "Future RAI Manager"
    assert saved["revision"] == first["revision"] + 1
    assert saved["assignedEa"] == first["assignedEa"]
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ProjectIntakeSnapshot)) == 1
    result = client.post("/api/projects/import", json=payload(
        expectedRevision=saved["revision"],
        markdown="- **Architect Assigned:** New EA\n- **Security Resource Assigned:** Christina Kelly\n- **RAI manager:** Ignore this name",
    )).json()
    assert result["assignedEa"] == "New EA"
    assert result["assignedSecurity"] == "Christina Kelly"
    assert result["assignedRai"] == "Future RAI Manager"
    assert client.get("/api/projects/3601").json()["assignedRai"] == "Future RAI Manager"


def test_missing_security_preserves_existing_but_placeholder_clears(client):
    first = client.post("/api/projects/import", json=payload(markdown="| Security Resource Assigned | Christina Kelly |")).json()
    second = client.post("/api/projects/import", json=payload(expectedRevision=first["revision"])).json()
    assert second["assignedSecurity"] == "Christina Kelly"
    third = client.post("/api/projects/import", json=payload(expectedRevision=second["revision"], markdown="| Security Resource Assigned | Not provided |")).json()
    assert third["assignedSecurity"] == "Not assigned"


def test_stale_rai_edit_is_rejected(client):
    first = client.post("/api/projects/import", json=payload()).json()
    body = {"assignedRai": "First editor", "expectedRevision": first["revision"]}
    assert client.patch("/api/projects/3601/rai-assignment", json=body).status_code == 200
    body["assignedRai"] = "Second editor"
    assert client.patch("/api/projects/3601/rai-assignment", json=body).status_code == 409
    assert client.get("/api/projects/3601").json()["assignedRai"] == "First editor"


@pytest.mark.parametrize("body", [
    {"assignedRai": " ", "expectedRevision": 1},
    {"assignedRai": "A" * 321, "expectedRevision": 1},
    {"assignedRai": "😀" * 161, "expectedRevision": 1},
    {"assignedRai": "Reviewer", "expectedRevision": 0},
    {"assignedRai": "Reviewer"},
    {"assignedRai": "Reviewer", "expectedRevision": 1, "assignedEa": "Cannot edit"},
    {"assignedRai": "Reviewer", "expectedRevision": 1, "assignedSecurity": "Cannot edit"},
])
def test_rai_edit_validation(client, body):
    client.post("/api/projects/import", json=payload())
    assert client.patch("/api/projects/3601/rai-assignment", json=body).status_code == 422
    assert client.get("/api/projects/3601").json()["assignedRai"] == "Chris Cawthon"


def test_missing_project(client):
    assert client.patch("/api/projects/9999/rai-assignment", json={"assignedRai": "Reviewer", "expectedRevision": 1}).status_code == 404


def test_non_admin_cannot_edit(client):
    client.post("/api/projects/import", json=payload())
    client.app.dependency_overrides[current_user] = lambda: {"roles": ["general-users"]}
    assert client.get("/api/projects/3601").status_code == 200
    assert client.patch("/api/projects/3601/rai-assignment", json={"assignedRai": "Unauthorized", "expectedRevision": 1}).status_code == 403
    assert client.get("/api/projects/3601").json()["assignedRai"] == "Chris Cawthon"


def test_oversized_intake_assignment_rejected(client):
    response = client.post("/api/projects/import", json=payload(markdown="| Security Resource Assigned | " + "A" * 321 + " |"))
    assert response.status_code == 422
    assert client.get("/api/projects").json()["total"] == 0
