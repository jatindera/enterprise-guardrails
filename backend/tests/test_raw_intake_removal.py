"""Regression coverage for the destructive transition and source-independent identities."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4
from io import StringIO
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text, select
from sqlalchemy.orm import Session
from app.db.models import Project, ProjectIntakeSnapshot, ProjectIntakeDetail
from app.modules.intake.reviewer_identity import primary_reviewer_upn
from app.scripts.backfill_intake import backfill
from app.modules.intake.service import store_context
from app.modules.intake.parser import parse_intake
from test_project_api import client, database, payload


@pytest.fixture(autouse=True)
def directory_stub(client):
    from app.modules.projects.ea_assignment_router import graph_resolver
    client.app.dependency_overrides[graph_resolver] = lambda: (lambda upn: SimpleNamespace(object_id=uuid4()))


def migration():
    path = Path(__file__).parents[1] / 'migrations/versions/20261030_remove_raw_intake.py'
    spec = spec_from_file_location('remove_raw_intake', path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('complete', [True, False])
def test_migration_checks_every_historical_snapshot_before_deletion(complete):
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE project_intake_snapshots (id TEXT PRIMARY KEY, markdown TEXT, source_item_id TEXT)'))
        connection.execute(text('CREATE TABLE project_intake_details (snapshot_id TEXT PRIMARY KEY, problem_statement TEXT)'))
        connection.execute(text("INSERT INTO project_intake_snapshots VALUES ('old', 'Old original text', 'item-1'), ('new', 'New original text', 'item-2')"))
        connection.execute(text("INSERT INTO project_intake_details VALUES ('new', 'New problem')"))
        if complete:
            connection.execute(text("INSERT INTO project_intake_details VALUES ('old', 'Old problem')"))
        with Operations.context(MigrationContext.configure(connection)):
            if not complete:
                with pytest.raises(RuntimeError, match='not structured'):
                    migration().upgrade()
                assert connection.scalar(text("SELECT markdown FROM project_intake_snapshots WHERE id='old'")) == 'Old original text'
            else:
                migration().upgrade()
                assert 'markdown' not in {column['name'] for column in inspect(connection).get_columns('project_intake_snapshots')}
                assert connection.scalar(text('SELECT COUNT(*) FROM project_intake_snapshots')) == 2
                assert connection.scalar(text('SELECT COUNT(*) FROM project_intake_details')) == 2
                assert connection.scalar(text("SELECT source_item_id FROM project_intake_snapshots WHERE id='old'")) == 'item-1'


def test_removal_requires_online_verification_and_disallows_lossy_downgrade():
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name='mssql', opts={'as_sql': True, 'output_buffer': output})):
        with pytest.raises(RuntimeError, match='online connection'):
            migration().upgrade()
        with pytest.raises(RuntimeError, match='backup'):
            migration().downgrade()
    assert not output.getvalue()


def test_sqlserver_guard_holds_snapshot_table_lock(monkeypatch):
    import alembic.op
    statements = []
    connection = SimpleNamespace(dialect=SimpleNamespace(name='mssql'), scalar=lambda sql: statements.append(str(sql)) or 0)
    monkeypatch.setattr(alembic.op, 'get_context', lambda: SimpleNamespace(as_sql=False))
    monkeypatch.setattr(alembic.op, 'get_bind', lambda: connection)
    monkeypatch.setattr(alembic.op, 'drop_column', lambda table, column: statements.append((table, column)))
    migration().upgrade()
    assert 'AS snapshots WITH (TABLOCKX, HOLDLOCK)' in statements[0]
    assert statements[1] == ('project_intake_snapshots', 'markdown')


def test_new_import_and_reimport_do_not_need_or_return_raw_markdown(client, database):
    assert 'markdown' not in ProjectIntakeSnapshot.__table__.columns
    first = client.post('/api/projects/import', json=payload(markdown='### Problem Statement\nFirst problem.')).json()
    assert 'intakeSource' not in first
    second = client.post('/api/projects/import', json=payload(markdown='### Problem Statement\nChanged problem.', expectedRevision=first['revision']))
    assert second.status_code == 200
    assert second.json()['intakeContext']['facts']['problemStatement'] == 'Changed problem.'
    previous = client.get('/api/projects/3601/intake-context', params={'snapshotId': first['intakeContext']['version']['snapshotId']})
    assert previous.json()['facts']['problemStatement'] == 'First problem.'
    with database.connect() as connection:
        assert 'markdown' not in {column['name'] for column in inspect(connection).get_columns('project_intake_snapshots')}
    assert backfill(database) == {'completed': 0, 'failed': []}


def test_backfill_cannot_fabricate_missing_data_after_removal(client, database):
    client.post('/api/projects/import', json=payload())
    with Session(database) as session, session.begin():
        project = session.scalar(select(Project))
        snapshot = ProjectIntakeSnapshot(project_id=project.id, source_file_name='Missing source')
        session.add(snapshot)
    report = backfill(database)
    assert report['completed'] == 0
    assert report['failed'][0]['errorType'] == 'StructuredIntakeMissing'


@pytest.mark.parametrize('domain,label,email', [
    ('ea', 'Architect Assigned', 'ea@example.com'),
    ('security', 'Security Resource Assigned', 'security@example.com'),
])
def test_manual_identity_retry_uses_structured_assignment_field(domain, label, email, client, database):
    from app.modules.projects.ea_assignment import resolve_primary as resolve_ea
    from app.modules.projects.security_assignment import resolve_primary as resolve_security
    client.post('/api/projects/import', json=payload(markdown=f'| {label} | Reviewer <{email}> |'))
    resolved = uuid4()
    looked_up = []
    def resolver(upn):
        looked_up.append(upn)
        return SimpleNamespace(object_id=resolved)
    with Session(database) as session:
        project = session.scalar(select(Project))
        revision = project.revision
    with Session(database) as session:
        result = (resolve_ea if domain == 'ea' else resolve_security)(session, '3601', revision,
            {'roles': ['Admin'], 'objectId': str(uuid4())}, resolver)
    assert result['primaryResolved'] is True and looked_up == [email]


@pytest.mark.parametrize('domain,label', [('ea', 'Architect Assigned'), ('security', 'Security Resource Assigned')])
def test_structured_resolution_never_uses_narrative_or_ambiguous_people(domain, label, client, database):
    from fastapi import HTTPException
    client.post('/api/projects/import', json=payload())
    with Session(database) as session, session.begin():
        project = session.scalar(select(Project))
        snapshot = ProjectIntakeSnapshot(project_id=project.id, source_file_name='Direct structured import')
        session.add(snapshot); session.flush()
        store_context(session, snapshot, parse_intake(f'| {label} | One <one@example.com>, Two <two@example.com> |\n### Problem Statement\nContact unrelated@example.com'))
        with pytest.raises(HTTPException) as error:
            primary_reviewer_upn(session, project, domain)
        assert error.value.status_code == 422

@pytest.mark.parametrize('value', ['Not provided', 'Reviewer name only'])
def test_present_assignment_without_email_does_not_use_narrative_or_previous_binding(value, client, database):
    client.post('/api/projects/import', json=payload())
    with Session(database) as session, session.begin():
        project = session.scalar(select(Project))
        project.assigned_ea = 'previous@example.com'
        snapshot = ProjectIntakeSnapshot(project_id=project.id, source_file_name='Structured assignment')
        session.add(snapshot); session.flush()
        store_context(session, snapshot, parse_intake(f'| Architect Assigned | {value} |\n### Problem Statement\nAsk unrelated@example.com'))
        assert primary_reviewer_upn(session, project, 'ea') is None


def test_repeated_same_assignment_field_is_still_ambiguous(client, database):
    from fastapi import HTTPException
    client.post('/api/projects/import', json=payload())
    with Session(database) as session, session.begin():
        project = session.scalar(select(Project))
        snapshot = ProjectIntakeSnapshot(project_id=project.id, source_file_name='Repeated assignment')
        session.add(snapshot); session.flush()
        store_context(session, snapshot, parse_intake('| Architect Assigned | one@example.com |\n| Architect Assigned | one@example.com |'))
        with pytest.raises(HTTPException) as error:
            primary_reviewer_upn(session, project, 'ea')
        assert error.value.status_code == 422
