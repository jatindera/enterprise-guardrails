import json
from uuid import UUID,uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import EAMeetingReview,EAReviewMeeting
from app.core.auth import current_user
from app.modules.ea_preparation.router import hosted_invoker
from test_ea_review_history import client,database,setup,create,upload,state,generate,accept,reopen
from test_ea_preparation import PRIMARY,HELPER

BASE='/api/projects/3601/ea-review/meetings'


def save(client,m,technologies=None,rationale='Proposed approach',revision=None):
    return client.put(f'{BASE}/{m["id"]}/proposal',json={
        'expectedRevision':state(client,m)['revision'] if revision is None else revision,
        'technologies':['Azure','Foundry'] if technologies is None else technologies,'rationale':rationale})


def test_proposal_is_persisted_in_context_and_version_snapshot(client,database,setup):
    _,calls=setup;m=create(client);upload(client,m)
    saved=save(client,m)
    assert saved.status_code==200,saved.text
    assert state(client,m)['proposal']['technologies']==['Azure','Foundry']
    assert state(client,m)['proposal']['updatedAt']
    first=generate(client,m)
    assert first.status_code==200,first.text
    assert calls[-1]['human_proposal']=={'technologies':['Azure','Foundry'],'rationale':'Proposed approach'}
    assert set(calls[-1])=={'task','project_context','human_proposal','transcripts'}
    assert save(client,m,['Databricks'],'Changed after discussion').status_code==200
    assert accept(client,m,first.json()).status_code==409
    upload(client,m,'More stakeholder answers.',name='meeting-2.txt')
    second=generate(client,m)
    assert second.status_code==200,second.text
    assert calls[-1]['human_proposal']['technologies']==['Databricks']
    assert len(calls[-1]['transcripts'])==2
    with Session(database) as db:
        row=db.get(EAMeetingReview,UUID(first.json()['id']))
        assert json.loads(row.input_manifest)['human_proposal']['technologies']==['Azure','Foundry']
        assert db.get(EAReviewMeeting,UUID(m['id'])).proposal_rationale=='Changed after discussion'


def test_save_is_batched_idempotent_and_rejects_stale_different_changes(client,database,setup):
    m=create(client);initial=state(client,m)['revision']
    assert save(client,m,revision=initial).status_code==200
    revision=state(client,m)['revision']
    assert save(client,m,revision=initial).status_code==200
    assert state(client,m)['revision']==revision
    assert save(client,m,['SAP BTP'],'Another edit',revision=initial).status_code==409


def test_proposal_authorization_and_accepted_lock(client,database,setup):
    m=create(client);upload(client,m)
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'roles':['general-users']}
    assert save(client,m).status_code==403
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(HELPER),'roles':['enterprise-architect']}
    assert save(client,m).status_code==200
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'roles':['enterprise-architect']}
    draft=generate(client,m).json();assert accept(client,m,draft).status_code==200
    assert save(client,m,['Power Apps']).status_code==409
    assert reopen(client,m).status_code==200
    assert save(client,m,['Power Apps']).status_code==200
    assert client.put(f'/api/projects/99999/ea-review/meetings/{m["id"]}/proposal',json={
        'expectedRevision':1,'technologies':['Azure'],'rationale':'Wrong demand'}).status_code==404


def test_proposal_validation(client,database,setup):
    m=create(client)
    for tech,rationale in [(['Unknown'],'Why'),(['Azure','Azure'],'Why'),(['Others'],''),(['Azure'],'😀'*3000)]:
        assert save(client,m,tech,rationale).status_code==422
    assert save(client,m,[],rationale='Stack not yet selected').status_code==200


def test_independent_review_can_require_more_questions(client,database,setup):
    m=create(client);upload(client,m,'Hosting requirements have not been confirmed.')
    assert save(client,m,['Azure'],'Human proposal, subject to review').status_code==200
    def invoke(raw):
        source=json.loads(raw)['transcripts'][0]
        return json.dumps({'summary':'Hosting remains unclear.',
            'technology_review':{'status':'Needs clarification','feedback':'Do not finalize Azure yet; clarify hosting constraints.'},
            'findings':[{'kind':'open_item','text':'Hosting requirements are unclear.',
                'citations':[{'kind':'transcript','id':source['id'],'line':1}]}],
            'follow_up_questions':['Which hosting constraints are mandatory?']})
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    response=generate(client,m)
    assert response.status_code==200,response.text
    assert 'Needs clarification' in response.json()['text']
    assert 'Do not finalize Azure yet' in response.json()['text']
    assert 'Which hosting constraints are mandatory?' in response.json()['text']
    assert state(client,m)['proposal']['technologies']==['Azure']  # AI cannot overwrite the human proposal.
    with Session(database) as db:
        row=db.get(EAMeetingReview,UUID(response.json()['id']))
        assert json.loads(row.ai_result)['technology_review']['status']=='Needs clarification'


def test_proposal_migration_preserves_existing_rows(database,monkeypatch):
    from importlib.util import spec_from_file_location,module_from_spec
    from pathlib import Path
    from sqlalchemy import inspect
    from alembic.operations import Operations
    from alembic.migration import MigrationContext
    names=['proposed_technologies','proposal_rationale','proposal_updated_at','proposal_updated_by','proposal_updated_by_name']
    with database.begin() as connection:
        operations=Operations(MigrationContext.configure(connection))
        for name in names:operations.drop_column('ea_review_meetings',name)
        spec=spec_from_file_location('proposal_migration',Path(__file__).parents[1]/'migrations/versions/20261101_ea_review_proposal.py')
        migration=module_from_spec(spec);spec.loader.exec_module(migration)
        monkeypatch.setattr(migration,'op',operations)
        migration.upgrade()
        assert set(names)<={c['name'] for c in inspect(connection).get_columns('ea_review_meetings')}
        migration.downgrade()
        assert not set(names)&{c['name'] for c in inspect(connection).get_columns('ea_review_meetings')}
        migration.upgrade()
