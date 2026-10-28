from uuid import uuid4
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.auth import current_user
from app.db.models import Project, GateDecisionEvent
from test_project_api import client, database, payload

BASE = '/api/projects/3601/pre-production-gate'

def user(client, roles, oid=None):
    oid = oid or uuid4()
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(oid), 'name': 'Verified User', 'roles': roles}
    return oid

def create(client, database, value='Yes'):
    data = client.post('/api/projects/import', json=payload(markdown=f'| Pre-Production Gate Required | {value} |'))
    assert data.status_code == 201, data.text
    ids = {d: uuid4() for d in ['EA', 'Security', 'RAI']}
    with Session(database) as session, session.begin():
        project = session.scalar(select(Project))
        project.assigned_ea_object_id = ids['EA']
        project.assigned_security_object_id = ids['Security']
        project.assigned_rai_object_id = ids['RAI']
    return ids

def save(client, domain='EA', decision='Approved', revision=0):
    return client.put(BASE + '/decisions/' + domain, json={'decision': decision, 'comments': 'Checked implementation', 'expectedRevision': revision})

@pytest.mark.parametrize('value,required', [('Yes', True), ('No', False), ('', False), ('None', False)])
def test_intake_gate_requirement(client, database, value, required):
    create(client, database, value)
    assert client.get(BASE).json()['required'] is required
    assert client.get('/api/projects/3601').json()['gateRequired'] is required


def test_primary_can_only_save_own_domain_and_refresh_has_saved_history(client, database):
    ids = create(client, database)
    user(client, ['enterprise-architect'], ids['EA'])
    assert save(client).status_code == 200
    assert save(client, 'Security').status_code == 403
    result = client.get(BASE).json()
    assert result['reviewers'][0]['saved']['decision'] == 'Approved'
    assert result['reviewers'][0]['saved']['actorName'] == 'Verified User'
    assert result['combinedStatus'] == 'Awaiting decisions'
    assert len(result['history']) == 1
    assert result['history'][0]['recordedAt'].endswith('Z')

@pytest.mark.parametrize('domain,role', [('Security', 'security-engineer'), ('RAI', 'rai-manager')])
def test_other_domains_are_bound_to_primary_object_id(client, database, domain, role):
    ids = create(client, database)
    user(client, [role], ids[domain])
    assert save(client, domain).status_code == 200
    assert save(client, 'EA').status_code == 403


def test_role_alone_or_additional_identity_does_not_allow_decision(client, database):
    create(client, database)
    oid = user(client, ['enterprise-architect'])
    with Session(database) as session, session.begin():
        session.scalar(select(Project)).additional_ea_object_id = oid
    assert save(client).status_code == 403
    assert client.patch(BASE + '/applicability', json={'required': False, 'expectedRevision': 1}).status_code == 403


def test_admin_edits_create_history_and_stale_revision_conflicts(client, database):
    create(client, database)
    user(client, ['Admin'])
    assert save(client).status_code == 200
    assert save(client, decision='On hold', revision=0).status_code == 409
    result = save(client, decision='On hold', revision=1)
    assert result.status_code == 200
    assert result.json()['reviewers'][0]['revision'] == 2
    assert len(result.json()['history']) == 2
    assert client.get(BASE).json()['reviewers'][0]['saved']['decision'] == 'On hold'

@pytest.mark.parametrize('choices,status', [
    (['Approved']*3, 'Approved'), (['Approved','Approved','Conditional approval'], 'Conditional approval'),
    (['Approved','On hold','Approved'], 'On hold'), (['Rejected','On hold','Approved'], 'Rejected'),
    (['Not applicable']*3, 'Not applicable'), (['Approved','Approved','Not applicable'], 'Not applicable'),
])
def test_combined_status_only_approves_three_approvals(client, database, choices, status):
    create(client, database)
    user(client, ['Admin'])
    for domain, choice in zip(['EA','Security','RAI'], choices):
        result = save(client, domain, choice)
        assert result.status_code == 200
    assert result.json()['combinedStatus'] == status


def test_checkbox_admin_only_disabled_gate_blocks_save_reimport_wins(client, database):
    create(client, database)
    user(client, ['Admin'])
    revision = client.get(BASE).json()['projectRevision']
    result = client.patch(BASE + '/applicability', json={'required': False, 'expectedRevision': revision})
    assert result.status_code == 200 and result.json()['required'] is False
    assert save(client).status_code == 409
    assert client.patch(BASE + '/applicability', json={'required': True, 'expectedRevision': revision}).status_code == 409
    revision = result.json()['projectRevision']
    imported = client.post('/api/projects/import', json=payload(markdown='| Pre-Production Gate Required | Yes |', expectedRevision=revision))
    assert imported.status_code == 200
    assert client.get(BASE).json()['required'] is True
    revision = imported.json()['revision']
    imported = client.post('/api/projects/import', json=payload(markdown='# No gate field', expectedRevision=revision))
    assert imported.status_code == 200
    assert client.get(BASE).json()['required'] is False


def test_primary_reassignment_requires_new_decision_but_retains_history(client, database):
    create(client, database)
    user(client, ['Admin'])
    save(client)
    with Session(database) as session, session.begin():
        session.scalar(select(Project)).assigned_ea_object_id = uuid4()
    state = client.get(BASE).json()
    assert not state['reviewers'][0]['current']
    assert len(state['history']) == 1
    assert state['combinedStatus'] == 'Awaiting decisions'


def test_cannot_forge_actor_or_blank_comment(client, database):
    create(client, database)
    user(client, ['Admin'])
    body = {'decision': 'Approved', 'comments': ' ', 'expectedRevision': 0}
    assert client.put(BASE + '/decisions/EA', json=body).status_code == 422
    body.update(comments='Checked', actorName='Another user')
    assert client.put(BASE + '/decisions/EA', json=body).status_code == 422
    assert client.get(BASE).json()['history'] == []


def test_gate_migration_backfills_latest_intake_and_creates_history_table():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.operations import Operations
    from alembic.migration import MigrationContext
    path = Path(__file__).parents[1] / 'migrations/versions/20261028_gate_decisions.py'
    spec = spec_from_file_location('gate_migration', path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == '20261028_arb_applicability'
    engine = create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE projects (id TEXT PRIMARY KEY)'))
        conn.execute(text('CREATE TABLE project_intake_snapshots (id TEXT, project_id TEXT, imported_at TEXT, markdown TEXT)'))
        conn.execute(text("INSERT INTO projects VALUES ('a'), ('b'), ('c')"))
        conn.execute(text('INSERT INTO project_intake_snapshots VALUES (:id, :pid, :time, :md)'), [
            {'id': '1', 'pid': 'a', 'time': '2026-01-01', 'md': '| Pre-Production Gate Required | Yes |'},
            {'id': '2', 'pid': 'b', 'time': '2026-01-01', 'md': '| Pre-Production Gate Required | Yes |'},
            {'id': '3', 'pid': 'b', 'time': '2026-02-01', 'md': '| Pre-Production Gate Required | No |'},
        ])
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        assert conn.execute(text('SELECT id, gate_required FROM projects ORDER BY id')).all() == [('a',1),('b',0),('c',0)]
        assert 'gate_decision_events' in inspect(conn).get_table_names()
    engine.dispose()
