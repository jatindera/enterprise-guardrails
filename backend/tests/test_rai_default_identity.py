from types import SimpleNamespace
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import Project
from app.modules.projects.ea_assignment_router import graph_resolver
from app.modules.projects.graph_identity import IdentityNotFound
from test_project_api import client, database, payload


def test_configured_default_rai_is_resolved_and_reimport_preserves_assignment(client, database):
    oid = uuid4()
    client.app.state.token_verifier.settings.default_rai_upn = 'rai@example.com'
    client.app.dependency_overrides[graph_resolver] = lambda: lambda upn: SimpleNamespace(object_id=oid)
    result = client.post('/api/projects/import', json=payload())
    assert result.status_code == 201
    assert result.json()['assignedRai'] == 'rai@example.com'
    with Session(database) as session:
        project = session.scalar(select(Project).where(Project.demand_id == '3601'))
        assert project.assigned_rai_object_id == oid
    client.app.state.token_verifier.settings.default_rai_upn = 'another@example.com'
    result = client.post('/api/projects/import', json=payload(expectedRevision=result.json()['revision']))
    assert result.status_code == 200
    assert result.json()['assignedRai'] == 'rai@example.com'


def test_missing_default_user_imports_unresolved(client, database, caplog):
    client.app.state.token_verifier.settings.default_rai_upn = 'missing@example.com'
    def resolve(upn):
        raise IdentityNotFound()
    client.app.dependency_overrides[graph_resolver] = lambda: resolve
    result = client.post('/api/projects/import', json=payload())
    assert result.status_code == 201
    with Session(database) as session:
        project = session.scalar(select(Project).where(Project.demand_id == '3601'))
        assert project.assigned_rai_object_id is None
    assert 'Identity unresolved for RAI' in caplog.text
