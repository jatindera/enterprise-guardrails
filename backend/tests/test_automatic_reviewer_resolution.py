from types import SimpleNamespace
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.models import Project
from app.modules.projects.ea_assignment_router import graph_resolver
from app.modules.projects.graph_identity import IdentityNotFound
from test_project_api import client, database, payload


def test_import_resolves_ea_and_security(client, database):
    ea, security = uuid4(), uuid4()
    def resolve(upn):
        return SimpleNamespace(object_id={'ea@example.com': ea, 'security@example.com': security}[upn])
    client.app.dependency_overrides[graph_resolver] = lambda: resolve
    result = client.post('/api/projects/import', json=payload(markdown='| Architect Assigned | ea@example.com |\n| Security Resource Assigned | security@example.com |'))
    assert result.status_code == 201
    with Session(database) as session:
        project = session.scalar(select(Project).where(Project.demand_id == '3601'))
        assert project.assigned_ea_object_id == ea
        assert project.assigned_security_object_id == security


def test_lookup_failure_imports_without_binding(client, database, caplog):
    def resolve(upn):
        raise IdentityNotFound()
    client.app.dependency_overrides[graph_resolver] = lambda: resolve
    result = client.post('/api/projects/import', json=payload(markdown='| Architect Assigned | missing@example.com |'))
    assert result.status_code == 201
    with Session(database) as session:
        project = session.scalar(select(Project).where(Project.demand_id == '3601'))
        assert project.assigned_ea_object_id is None
    assert 'Identity unresolved' in caplog.text
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(uuid4()), 'roles': ['enterprise-architect']}
    assert client.get('/api/projects/3601/ea-access').json()['canEdit'] is False
