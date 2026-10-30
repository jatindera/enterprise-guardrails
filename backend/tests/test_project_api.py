"""HTTP and transaction tests using a disposable SQLite test database.

The production connection remains Azure SQL. SQLite is only a fast test double;
the README includes the separate Azure SQL/frontend verification sequence.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.auth import current_user
from app.db.models import Base, Project, ProjectIntakeSnapshot
from app.db.session import get_session
from app.main import create_app


@compiles(DATETIMEOFFSET, "sqlite")
def compile_test_datetime(type_, compiler, **kwargs):
    return "DATETIME"


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def client(database):
    application = create_app(Settings(_env_file=None, environment="test"))

    def test_session():
        with Session(database, autoflush=False) as session:
            yield session

    # Persistence tests use a trusted test principal, never a runtime bypass.
    application.dependency_overrides[current_user] = lambda: {
        "objectId": "test-admin", "name": "Test admin", "username": "", "roles": ["Admin"],
    }
    application.dependency_overrides[get_session] = test_session
    with TestClient(application) as test_client:
        yield test_client
    application.dependency_overrides.clear()


def payload(demand_id="3601", name="Example project", **changes):
    return {
        "demandId": demand_id, "name": name,
        "businessFunction": "Water", "assignedEa": "Jatinder Arora",
        "fileName": "intake.md", "markdown": f"# {name}\n# Demand Id - {demand_id}",
        **changes,
    }


def test_create_list_and_retrieve_latest_intake(client):
    response = client.post("/api/projects/import", json=payload())
    assert response.status_code == 201
    project = response.json()
    assert project["revision"] == 1
    assert project["assignedEa"] == "Jatinder Arora"
    assert project["intakeContext"]["version"]["sourceFileName"] == "intake.md"
    assert "intakeSource" not in project
    assert client.get("/api/projects/3601").json() == project
    page = client.get("/api/projects?limit=1&offset=0").json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == project["id"]
    assert "intakeSource" not in page["items"][0]  # no Markdown in bulk lists


def test_reimport_advances_revision_and_retains_snapshots(client, database):
    first = client.post("/api/projects/import", json=payload()).json()
    response = client.post("/api/projects/import", json=payload(
        expectedRevision=first["revision"], markdown="# Revised intake",
        businessFunction=None, assignedEa=None,
    ))
    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == first["id"]
    assert updated["revision"] == 2
    assert updated["businessFunction"] == "Water"
    assert updated["assignedEa"] == "Jatinder Arora"
    assert client.get("/api/projects/3601").json()["intakeContext"]["version"]["sourceFileName"] == "intake.md"
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(Project)) == 1
        assert session.scalar(select(func.count()).select_from(ProjectIntakeSnapshot)) == 2


def test_identical_reimport_also_advances_revision(client):
    client.post("/api/projects/import", json=payload())
    response = client.post("/api/projects/import", json=payload(expectedRevision=1))
    assert response.status_code == 200
    assert response.json()["revision"] == 2


@pytest.mark.parametrize("revision", [None, 99])
def test_stale_or_missing_revision_changes_nothing(client, database, revision):
    client.post("/api/projects/import", json=payload())
    response = client.post("/api/projects/import", json=payload(
        expectedRevision=revision, name="Should not be saved",
    ))
    assert response.status_code == 409
    assert client.get("/api/projects/3601").json()["name"] == "Example project"
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(ProjectIntakeSnapshot)) == 1


def test_duplicate_name_conflict(client):
    client.post("/api/projects/import", json=payload())
    response = client.post("/api/projects/import", json=payload(demand_id="3602"))
    assert response.status_code == 409
    assert client.get("/api/projects").json()["total"] == 1


def test_rename_to_another_project_name_is_rejected(client):
    client.post("/api/projects/import", json=payload())
    client.post("/api/projects/import", json=payload("3602", "Another project"))
    response = client.post("/api/projects/import", json=payload(
        "3602", "Example project", expectedRevision=1,
    ))
    assert response.status_code == 409
    assert client.get("/api/projects/3602").json()["name"] == "Another project"


def test_unknown_project_returns_not_found(client):
    assert client.get("/api/projects/9999").status_code == 404


def test_create_with_expected_revision_is_rejected(client):
    response = client.post("/api/projects/import", json=payload(expectedRevision=1))
    assert response.status_code == 409


@pytest.mark.parametrize("changes", [
    {"demandId": "invalid"}, {"name": " "}, {"markdown": " "},
    {"fileName": "intake.pdf"}, {"fileName": "../intake.md"},
    {"expectedRevision": 0}, {"securityStatus": "Approved"},
    {"name": "\U0001f600" * 200},
])
def test_invalid_imports(client, changes):
    response = client.post("/api/projects/import", json=payload(**changes))
    assert response.status_code == 422
    assert client.get("/api/projects").json()["total"] == 0


def test_leading_zero_demand_id_is_preserved(client):
    response = client.post("/api/projects/import", json=payload(demand_id="003601"))
    assert response.status_code == 201
    assert response.json()["demandId"] == "003601"


def test_snapshot_failure_rolls_back_project_update(client, database):
    client.post("/api/projects/import", json=payload())

    def fail_snapshot(mapper, connection, target):
        raise RuntimeError("Simulated snapshot failure")

    event.listen(ProjectIntakeSnapshot, "before_insert", fail_snapshot)
    try:
        response = client.post("/api/projects/import", json=payload(
            name="Must roll back", expectedRevision=1,
        ))
        assert response.status_code == 500
    finally:
        event.remove(ProjectIntakeSnapshot, "before_insert", fail_snapshot)

    with Session(database) as session:
        project = session.scalar(select(Project).where(Project.demand_id == "3601"))
        assert project.name == "Example project"
        assert project.revision == 1
        assert session.scalar(select(func.count()).select_from(ProjectIntakeSnapshot)) == 1


def test_pagination_and_limits(client):
    for number in range(3):
        client.post("/api/projects/import", json=payload(str(number), f"Project {number}"))
    first = client.get("/api/projects?limit=2").json()
    second = client.get("/api/projects?limit=2&offset=2").json()
    assert first["total"] == second["total"] == 3
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1
    assert {item["id"] for item in first["items"]}.isdisjoint(
        {item["id"] for item in second["items"]}
    )
    assert client.get("/api/projects?limit=101").status_code == 422
    assert client.get("/api/projects?offset=-1").status_code == 422
