from types import SimpleNamespace
from uuid import UUID
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.auth import current_user
from app.db.models import Project, MeetingPreparationRecord
from app.modules.projects.ea_assignment_router import graph_resolver
from test_project_api import client, database, payload

PRIMARY = UUID(int=1)
HELPER = UUID(int=2)
OTHER = UUID(int=3)


def setup_project(client, database):
    client.app.dependency_overrides[graph_resolver] = lambda: lambda upn: SimpleNamespace(object_id=PRIMARY)
    assert client.post('/api/projects/import', json=payload()).status_code == 201
    with Session(database) as db:
        p = db.scalar(select(Project))
        for domain in ['ea', 'security', 'rai']:
            setattr(p, f'assigned_{domain}_object_id', PRIMARY)
            setattr(p, f'additional_{domain}_object_id', HELPER)
        db.commit()


def question(id='q1', domain='EA', selected=True):
    return {'id': id, 'focus': domain, 'question': 'Which systems are in scope?', 'reason': 'Clarify.',
        'priority': 'Essential', 'source': 'ai', 'selected': selected}


def draft(revision=0, domain='EA', **changes):
    return {'expectedRevision': revision, 'preparedQuestions': [question(domain=domain)],
        'additionalQuestions': [], 'currentQuestionId': None, 'askedQuestionIds': [], **changes}


@pytest.mark.parametrize('domain,role', [('EA','enterprise-architect'),('Security','security-engineer'),('RAI','rai-manager')])
def test_roundtrip_permissions_conflicts_and_progress(client, database, domain, role):
    setup_project(client, database)
    url = f'/api/projects/3601/meeting-preparation/{domain}'
    assert client.get(url).json()['revision'] == 0
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(PRIMARY), 'roles': [role]}
    saved = client.put(url, json=draft(domain=domain))
    assert saved.status_code == 200, saved.text
    version = saved.json()['revision']
    assert client.get(url).json()['preparedQuestions'][0]['selected'] is True
    assert client.put(url, json=draft(domain=domain)).status_code == 409
    # Additional reviewer can help but general/unassigned users cannot write.
    for oid, roles, allowed in [(HELPER,[role],True),(HELPER,['general-users'],False),(OTHER,[role],False),(OTHER,['Admin'],True)]:
        client.app.dependency_overrides[current_user] = lambda oid=oid, roles=roles: {'objectId': str(oid), 'roles': roles}
        state = client.get(url).json()
        assert state['canEdit'] == allowed
        response = client.put(url, json=draft(state['revision'],domain))
        assert response.status_code == (200 if allowed else 403)
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(PRIMARY), 'roles': [role]}
    version = client.get(url).json()['revision']
    saved = client.put(url, json=draft(version,domain, currentQuestionId='q1',askedQuestionIds=['q1']))
    assert saved.status_code == 200
    read = client.get(url).json()
    assert read['currentQuestionId'] == 'q1' and read['askedQuestionIds'] == ['q1']
    assert read['askedAt']['q1'].endswith('Z')
    changed = question(domain=domain); changed['question'] = 'Silently change asked text'
    assert client.put(url, json=draft(read['revision'],domain, preparedQuestions=[changed])).status_code == 422
    assert client.put(url, json=draft(read['revision'],domain,preparedQuestions=[])).status_code == 422
    assert client.get(url).json() == read
    # Domain records do not affect each other's revisions.
    other_domain = 'Security' if domain == 'EA' else 'EA'
    assert client.get(f'/api/projects/3601/meeting-preparation/{other_domain}').json()['revision'] == 0


def test_batch_of_ten_questions_and_validation(client, database):
    setup_project(client, database)
    url = '/api/projects/3601/meeting-preparation/EA'
    data = draft(preparedQuestions=[question(f'q{i}') for i in range(10)])
    saved = client.put(url,json=data)
    assert saved.status_code == 200
    assert len(client.get(url).json()['preparedQuestions']) == 10
    version = saved.json()['revision']
    for change in [dict(preparedQuestions=[question('same'),question('same')]),
        dict(currentQuestionId='missing'),dict(askedQuestionIds=['missing']),
        dict(preparedQuestions=[question(domain='Security')])]:
        assert client.put(url,json=draft(version,**change)).status_code == 422
    assert client.get('/api/projects/999/meeting-preparation/EA').status_code == 404
    assert client.get('/api/projects/3601/meeting-preparation/Other').status_code == 422
    with Session(database) as db:
        assert len(list(db.scalars(select(MeetingPreparationRecord)))) == 1



def test_asked_order_survives_batch_and_refresh(client, database):
    setup_project(client, database)
    url = '/api/projects/3601/meeting-preparation/EA'
    saved = client.put(url, json=draft(preparedQuestions=[question('q1'),question('q2')],
        askedQuestionIds=['q2','q1'], currentQuestionId='q1'))
    assert saved.status_code == 200
    state = client.get(url).json()
    assert state['askedQuestionIds'] == ['q2','q1']
    assert client.put(url, json=draft(state['revision'],preparedQuestions=state['preparedQuestions'],
        askedQuestionIds=['q1','q2'],currentQuestionId='q1')).status_code == 422


def test_new_migration_creates_question_columns_and_downgrades(database, monkeypatch):
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, inspect, Column, Uuid, MetaData, Table
    engine = create_engine('sqlite://')
    metadata = MetaData()
    Table('projects', metadata, Column('id', Uuid, primary_key=True))
    metadata.create_all(engine)
    spec = spec_from_file_location('meeting_migration', Path(__file__).parents[1] / 'migrations/versions/20261030_meeting_preparation.py')
    migration = module_from_spec(spec); spec.loader.exec_module(migration)
    with engine.begin() as connection:
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        assert {'asked_at','asked_order','source','selected','position'}.issubset({c['name'] for c in inspect(connection).get_columns('meeting_prepared_questions')})
        migration.downgrade()
        assert inspect(connection).get_table_names() == ['projects']
    engine.dispose()


def test_record_revision_uses_compare_and_swap(client, database):
    from sqlalchemy.orm.exc import StaleDataError
    from app.db.models import utc_now
    setup_project(client, database)
    assert client.put('/api/projects/3601/meeting-preparation/EA',json=draft()).status_code == 200
    with Session(database) as first, Session(database) as second:
        a = first.scalar(select(MeetingPreparationRecord))
        b = second.scalar(select(MeetingPreparationRecord))
        assert a.revision == b.revision
        a.updated_at = utc_now(); first.commit()
        b.updated_at = utc_now()
        with pytest.raises(StaleDataError): second.commit()
        second.rollback()
