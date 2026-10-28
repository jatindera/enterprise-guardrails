from uuid import uuid4
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.core.auth import current_user
from app.modules.projects.arb_intake import arb_required_from_intake
from test_project_api import client, database, payload


def intake(value):
    return f'| Architecture Review Board (ARB) required | {value} |'


@pytest.mark.parametrize('value,expected', [('Yes', True), ('No', False), ('', False), ('None', False)])
def test_import_arb_values_are_persisted(client, value, expected):
    response = client.post('/api/projects/import', json=payload(markdown=intake(value)))
    assert response.status_code == 201
    assert response.json()['arbRequired'] is expected
    assert client.get('/api/projects/3601').json()['arbRequired'] is expected
    assert client.get('/api/projects').json()['items'][0]['arbRequired'] is expected


@pytest.mark.parametrize('markdown,expected', [
    ('# No ARB field', False),
    ('- **Architecture Review Board (ARB) Required:** Yes', True),
    (r'\| Architecture Review Board (ARB) required | Yes |', True),
    ('**Architecture Review Board (ARB) Required:** None', False),
    ('| ARB required | No |\nThe business says Yes.', False),
])
def test_parser_uses_named_field_only(markdown, expected):
    assert arb_required_from_intake(markdown) is expected


def test_conflicting_or_invalid_intake_is_rejected(client):
    for md in [intake('Maybe'), intake('Yes') + '\n' + intake('No')]:
        assert client.post('/api/projects/import', json=payload(markdown=md)).status_code == 422
    assert client.get('/api/projects').json()['total'] == 0


def set_user(client, roles):
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(uuid4()), 'roles': roles, 'name': 'Reviewer'}


def toggle(client, required, revision):
    return client.patch('/api/projects/3601/arb-applicability', json={'arbRequired': required, 'expectedRevision': revision})


@pytest.mark.parametrize('role', ['enterprise-architect', 'security-engineer', 'rai-manager', 'arb-core-team', 'general-users'])
def test_non_admin_cannot_toggle_even_when_ea_or_core(client, role):
    client.post('/api/projects/import', json=payload(markdown=intake('Yes')))
    set_user(client, [role])
    assert toggle(client, False, 1).status_code == 403
    assert client.get('/api/projects/3601').json()['arbRequired'] is True


def test_admin_toggle_and_reimport_latest_value_wins(client):
    first = client.post('/api/projects/import', json=payload(markdown=intake('No'))).json()
    changed = toggle(client, True, first['revision'])
    assert changed.status_code == 200 and changed.json()['arbRequired'] is True
    assert toggle(client, False, first['revision']).status_code == 409
    revision = changed.json()['revision']
    for value, expected in [('No', False), ('Yes', True), ('', False), ('Yes', True), ('None', False)]:
        response = client.post('/api/projects/import', json=payload(markdown=intake(value), expectedRevision=revision))
        assert response.status_code == 200
        assert response.json()['arbRequired'] is expected
        revision = response.json()['revision']
    response = client.post('/api/projects/import', json=payload(markdown='# Field absent', expectedRevision=revision))
    assert response.json()['arbRequired'] is False


def test_disabled_arb_blocks_all_writes_but_preserves_votes(client):
    client.post('/api/projects/import', json=payload(markdown=intake('Yes')))
    set_user(client, ['Admin', 'arb-core-team'])
    vote = {'choice': 'For', 'reason': None, 'roundNumber': 1, 'expectedRevision': 0}
    assert client.put('/api/projects/3601/arb-vote', json=vote).status_code == 200
    revision = client.get('/api/projects/3601').json()['revision']
    disabled = toggle(client, False, revision).json()
    vote['expectedRevision'] = 1
    assert client.put('/api/projects/3601/arb-vote', json=vote).status_code == 409
    assert client.post('/api/projects/3601/arb-voting/close', json={'roundNumber': 1}).status_code == 409
    assert client.post('/api/projects/3601/arb-voting/reopen', json={'roundNumber': 1, 'reason': 'Revised'}).status_code == 409
    results = client.get('/api/projects/3601/arb-voting').json()
    assert results['total'] == 1
    assert not results['canVote'] and not results['canClose'] and not results['canReopen']
    assert toggle(client, True, disabled['revision']).status_code == 200
    assert client.get('/api/projects/3601/arb-voting').json()['total'] == 1


def test_migration_backfills_latest_snapshot_without_changing_votes():
    path = Path(__file__).parents[1] / 'migrations/versions/20261028_arb_applicability.py'
    spec = spec_from_file_location('arb_applicability_migration', path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == '20261028_arb_voting_rounds'
    engine = create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE projects (id TEXT PRIMARY KEY)'))
        conn.execute(text('CREATE TABLE project_intake_snapshots (id TEXT, project_id TEXT, imported_at TEXT, markdown TEXT)'))
        conn.execute(text("INSERT INTO projects VALUES ('a'), ('b'), ('c')"))
        conn.execute(text('INSERT INTO project_intake_snapshots VALUES (:id, :pid, :time, :md)'), [
            {'id': '1', 'pid': 'a', 'time': '2026-01-01', 'md': intake('No')},
            {'id': '2', 'pid': 'a', 'time': '2026-02-01', 'md': intake('Yes')},
            {'id': '3', 'pid': 'b', 'time': '2026-01-01', 'md': intake('Yes')},
            {'id': '4', 'pid': 'b', 'time': '2026-02-01', 'md': intake('')},
        ])
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        assert conn.execute(text('SELECT id, arb_required FROM projects ORDER BY id')).all() == [('a', 1), ('b', 0), ('c', 0)]
    engine.dispose()
