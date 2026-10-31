import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4, UUID
from unittest.mock import Mock
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.models import EAMeetingTranscript,EAMeetingReview,EAReviewMeeting
from app.modules.artifacts.storage import artifact_store
from app.modules.ea_preparation.router import hosted_invoker
from test_ea_preparation import setup_project,PRIMARY,HELPER
from test_project_api import client,database,payload
from test_gate_artifacts import Store

BASE='/api/projects/3601/ea-review/meetings'

@pytest.fixture
def setup(client,database,monkeypatch):
    setup_project(client,database)
    monkeypatch.setenv('APP_EA_EXECUTION_MODE','local')
    store=Store(); client.app.dependency_overrides[artifact_store]=lambda:store
    calls=[]
    def invoke(raw):
        data=json.loads(raw); calls.append(data)
        source=data['transcripts'][0]
        line=source['lines'][0]
        return json.dumps({'summary':'Stakeholder-reported requirements and open points.',
            'findings':[{'kind':'requirement','text':line['text'],'citations':[{'kind':'transcript',
                'id':source['id'],'line':line['line'],'quote':line['text']}]}], 'follow_up_questions':['Who confirms this requirement?']})
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    return store,calls

def create(client):
    r=client.post(BASE,json={}); assert r.status_code==200,r.text
    return r.json()

def state(client,m): return client.get(f'{BASE}/{m["id"]}').json()

def upload(client,m,text='Retention is 30 days.',uid=None,name='session.txt'):
    return client.put(f'{BASE}/{m["id"]}/transcripts/{uid or uuid4()}',params={'fileName':name},content=text.encode(),headers={'content-type':'application/octet-stream'})

def generate(client,m,uid=None):
    return client.put(f'{BASE}/{m["id"]}/reviews/{uid or uuid4()}/generate',json={'expectedRevision':state(client,m)['revision']})

def accept(client,m,r):
    return client.post(f'{BASE}/{m["id"]}/reviews/{r["id"]}/accept',json={'expectedRevision':state(client,m)['revision']})


def test_two_meetings_carry_forward_accepted_review_and_keep_history(client,database,setup):
    store,calls=setup
    first=create(client); file=upload(client,first).json()
    assert '/ea/meetings/' in next(iter(store.blobs))[1]
    assert client.get(f'{BASE}/{first["id"]}/transcripts/{file["id"]}/download').content==b'Retention is 30 days.'
    uid=uuid4(); r=generate(client,first,uid); assert r.status_code==200,r.text
    review=r.json(); assert review['version']==1
    assert calls[0]['previous_accepted_review'] is None
    assert generate(client,first,uid).json()==review and len(calls)==1
    edited=client.put(f'{BASE}/{first["id"]}/reviews/{uuid4()}/edit',json={'expectedRevision':state(client,first)['revision'],
        'parentReviewId':review['id'],'text':review['text']+'\nReviewer correction: confirm with Operations.'})
    assert edited.status_code==200,edited.text
    edit=edited.json(); assert edit['version']==2 and edit['parentReviewId']==review['id']
    assert accept(client,first,edit).status_code==200
    assert upload(client,first,'Changed').status_code==409
    second=create(client); assert second['number']==2
    assert upload(client,second,'Retention changes to 90 days.').status_code==200
    result=generate(client,second); assert result.status_code==200,result.text
    assert result.json()['basisReviewId']==edit['id']
    assert calls[-1]['previous_accepted_review']['id']==edit['id']
    assert 'Reviewer correction' in json.dumps(calls[-1])
    assert accept(client,second,result.json()).status_code==200
    first_state=state(client,first)
    assert first_state['state']=='Accepted' and len(first_state['reviews'])==2
    assert first_state['reviews'][0]['text']==review['text']
    assert client.get(BASE).json()['latestAcceptedReview']['id']==result.json()['id']
    with Session(database) as db:
        assert len(list(db.scalars(select(EAReviewMeeting))))==2
        assert len(list(db.scalars(select(EAMeetingReview))))==3
        assert db.get(EAMeetingTranscript,UUID(file['id'])).sha256


def test_access_and_only_primary_or_admin_accept(client,database,setup):
    m=create(client);upload(client,m);review=generate(client,m).json()
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(HELPER),'roles':['enterprise-architect']}
    assert state(client,m)['canEdit'] is True and state(client,m)['canAccept'] is False
    assert accept(client,m,review).status_code==403
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'roles':['enterprise-architect']}
    assert accept(client,m,review).status_code==200
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(HELPER),'roles':['general-users']}
    assert client.get(BASE).status_code==200
    assert client.post(BASE,json={}).status_code==403
    assert upload(client,m).status_code==403


def test_storage_failure_pending_retry_and_cancel(client,database,setup):
    store,_=setup;m=create(client);uid=uuid4();store.fail=True
    assert upload(client,m,uid=uid).status_code==503
    assert state(client,m)['transcripts'][0]['status']=='Pending'
    assert generate(client,m).status_code==409
    store.fail=False
    assert upload(client,m,uid=uid).status_code==200
    count=store.calls
    assert upload(client,m,uid=uid).status_code==200 and store.calls==count
    assert upload(client,m,'Different',uid=uid).status_code==409
    assert client.delete(f'{BASE}/{m["id"]}/transcripts/{uid}').status_code==200
    assert state(client,m)['transcripts']==[]
    assert not store.blobs
    with Session(database) as db:
        assert db.get(EAMeetingTranscript,uid) is None
    assert client.get(f'{BASE}/{m["id"]}/transcripts/{uid}/download').status_code==404


def test_invalid_citations_fail_without_creating_accepted_review(client,database,setup):
    m=create(client);upload(client,m)
    client.app.dependency_overrides[hosted_invoker]=lambda:lambda _:json.dumps({'summary':'Unsupported',
        'findings':[{'kind':'requirement','text':'Invented','citations':[{'kind':'transcript','id':str(uuid4()),'line':1,'quote':'Invented'}]}]})
    r=generate(client,m);assert r.status_code==502,r.text
    assert state(client,m)['reviews'][0]['status']=='Failed'
    assert client.get(BASE).json()['latestAcceptedReview'] is None


def test_stale_input_and_versions_cannot_be_accepted(client,database,setup):
    m=create(client);upload(client,m);r=generate(client,m).json()
    assert upload(client,m,'New evidence',name='two.txt').status_code==200
    assert accept(client,m,r).status_code==409
    new=generate(client,m).json()
    assert accept(client,m,r).status_code==409
    assert accept(client,m,new).status_code==200


def test_cross_project_ids_and_revision_validation(client,database,setup):
    m=create(client);file=upload(client,m).json()
    assert client.post('/api/projects/import',json=payload(demand_id='3602',name='Other project')).status_code==201
    assert client.get(f'/api/projects/3602/ea-review/meetings/{m["id"]}').status_code==404
    assert client.get(f'/api/projects/3602/ea-review/meetings/{m["id"]}/transcripts/{file["id"]}/download').status_code==404
    assert client.put(f'{BASE}/{m["id"]}/reviews/{uuid4()}/generate',json={'expectedRevision':1}).status_code==409
    assert upload(client,m,name='../x.txt').status_code==422
    assert upload(client,m,text=' ').status_code==422
    assert upload(client,m,name='x.pdf').status_code==422


def test_input_budget_no_truncation_and_stuck_request_recovery(client,database,setup,monkeypatch):
    store,calls=setup;m=create(client);upload(client,m,'x'*6000)
    monkeypatch.setenv('APP_EA_REVIEW_MAX_INPUT_CHARS','4000')
    assert generate(client,m).status_code==422
    assert not calls
    with Session(database) as db,db.begin():
        row=db.scalar(select(EAMeetingReview));row.status='Generating';row.created_at=datetime.now(timezone.utc)-timedelta(minutes=11);rid=row.id
    assert client.post(f'{BASE}/{m["id"]}/reviews/{rid}/recover').status_code==200
    assert state(client,m)['reviews'][0]['status']=='Failed'


def test_migration_upgrade_downgrade_matches_models(database,monkeypatch):
    from importlib.util import spec_from_file_location,module_from_spec
    from pathlib import Path
    from sqlalchemy import inspect
    from alembic.operations import Operations
    from alembic.migration import MigrationContext
    from app.db.models import Base
    names=['ea_meeting_reviews','ea_meeting_transcripts','ea_review_meetings']
    with database.begin() as connection:
        for name in names:Base.metadata.tables[name].drop(connection)
        spec=spec_from_file_location('ea_review_migration',Path(__file__).parents[1]/'migrations/versions/20261031_ea_meeting_reviews.py')
        migration=module_from_spec(spec);spec.loader.exec_module(migration)
        monkeypatch.setattr(migration,'op',Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        for name in names:
            assert {c['name'] for c in inspect(connection).get_columns(name)}==set(Base.metadata.tables[name].columns.keys())
        migration.downgrade()
        assert not any(name in inspect(connection).get_table_names() for name in names)
        for name in reversed(names):Base.metadata.tables[name].create(connection)


def test_pending_upload_blocks_acceptance_even_with_latest_revision(client,database,setup):
    store,_=setup;m=create(client);upload(client,m);review=generate(client,m).json()
    store.fail=True
    assert upload(client,m,'Second source',name='pending.txt').status_code==503
    assert accept(client,m,review).status_code==409


def test_new_meeting_is_idempotent_until_previous_is_accepted(client,database,setup):
    one=create(client);two=create(client)
    assert one['id']==two['id']
    assert len(client.get(BASE).json()['meetings'])==1


def test_questions_changed_during_inference_invalidate_result(client,database,setup):
    _,calls=setup;m=create(client);upload(client,m)
    original=client.app.dependency_overrides[hosted_invoker]()
    def invoke(raw):
        result=original(raw)
        response=client.put('/api/projects/3601/meeting-preparation/EA',json={
            'expectedRevision':0,'preparedQuestions':[{'id':'new','focus':'EA','question':'New context?',
                'reason':'New','priority':'Essential','selected':True,'source':'manual'}],
            'additionalQuestions':[],'askedQuestionIds':[],'currentQuestionId':None})
        assert response.status_code==200,response.text
        return result
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    response=generate(client,m)
    assert response.status_code==409,response.text
    assert state(client,m)['reviews'][0]['status']=='Failed'


def test_unprepared_question_can_be_extracted_with_transcript_evidence(client,database,setup):
    m=create(client);upload(client,m,'Who owns support? Operations owns support.')
    def invoke(raw):
        source=json.loads(raw)['transcripts'][0]
        return json.dumps({'summary':'Support ownership was discussed.','findings':[{'kind':'question_answer',
            'text':'A question outside the prepared list was asked.','question':'Who owns support?',
            'answer':'Operations owns support.','prepared_question_id':None,
            'citations':[{'kind':'transcript','id':source['id'],'line':1,'quote':'Operations owns support.'}]}]})
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    response=generate(client,m)
    assert response.status_code==200,response.text
    assert 'Question: Who owns support?' in response.json()['text']


def test_invalid_review_json_has_specific_safe_diagnostics(client,database,setup,caplog):
    m=create(client);upload(client,m)
    client.app.dependency_overrides[hosted_invoker]=lambda:lambda _:'{"summary":"SECRET incomplete'
    response=generate(client,m)
    assert response.status_code==502 and 'invalid_json' in response.json()['error']['message']
    assert 'SECRET' not in caplog.text
    assert '"stage": "json"' in caplog.text


def test_review_output_limit_has_specific_error(client,database,setup):
    from app.modules.ea_preparation.errors import EAInferenceError
    m=create(client);upload(client,m)
    def invoke(_):raise EAInferenceError('output_limit')
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    response=generate(client,m)
    assert response.status_code==502 and 'output_limit' in response.json()['error']['message']


def test_hard_delete_failure_excludes_evidence_and_retry_removes_row(client,database,setup):
    store,calls=setup; m=create(client); file=upload(client,m).json()
    review=generate(client,m).json()
    store.delete_fail=True
    url=f'{BASE}/{m["id"]}/transcripts/{file["id"]}'
    response=client.delete(url)
    assert response.status_code==503
    assert 'excluded from AI' in response.text
    assert state(client,m)['transcripts'][0]['status']=='Deleting'
    assert len(store.blobs)==1
    assert generate(client,m).status_code==409
    assert accept(client,m,review).status_code==409
    assert client.get(url+'/download').status_code==404
    store.delete_fail=False
    assert client.delete(url).status_code==200
    assert client.delete(url).status_code==200
    assert not store.blobs and not state(client,m)['transcripts']
    with Session(database) as db:
        assert db.get(EAMeetingTranscript,UUID(file['id'])) is None
    assert accept(client,m,review).status_code==409
    assert len(calls)==1


def test_previously_soft_removed_file_can_be_deleted(client,database,setup):
    store,_=setup; m=create(client); file=upload(client,m).json()
    with Session(database) as db, db.begin():
        db.get(EAMeetingTranscript,UUID(file['id'])).status='Removed'
    assert state(client,m)['transcripts'][0]['status']=='Removed'
    assert client.delete(f'{BASE}/{m["id"]}/transcripts/{file["id"]}').status_code==200
    assert not store.blobs
    with Session(database) as db:
        assert db.get(EAMeetingTranscript,UUID(file['id'])) is None


def test_upload_finishes_after_delete_without_orphan(client,database,setup):
    store,_=setup; m=create(client); uid=uuid4()
    original_put=store.put
    def late_put(container,name,data,digest):
        assert client.delete(f'{BASE}/{m["id"]}/transcripts/{uid}').status_code==200
        original_put(container,name,data,digest)
    store.put=late_put
    assert upload(client,m,uid=uid).status_code==409
    assert not store.blobs and not state(client,m)['transcripts']


def test_delete_permission_and_accepted_meeting_lock(client,database,setup):
    store,_=setup; m=create(client); file=upload(client,m).json()
    url=f'{BASE}/{m["id"]}/transcripts/{file["id"]}'
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(HELPER),'roles':['general-users']}
    assert client.delete(url).status_code==403
    assert len(store.blobs)==1
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'roles':['enterprise-architect']}
    review=generate(client,m).json()
    assert accept(client,m,review).status_code==200
    assert client.delete(url).status_code==409
    assert len(store.blobs)==1


def test_delete_already_missing_blob_succeeds(client,database,setup):
    store,_=setup; m=create(client); file=upload(client,m).json()
    store.blobs.clear()
    assert client.delete(f'{BASE}/{m["id"]}/transcripts/{file["id"]}').status_code==200
    with Session(database) as db:
        assert db.get(EAMeetingTranscript,UUID(file['id'])) is None


def test_regeneration_excludes_deleted_wrong_transcript(client,database,setup):
    store,calls=setup; m=create(client)
    wrong=upload(client,m,'Wrong project information.',name='wrong.txt').json()
    upload(client,m,'Correct stakeholder requirements.',name='correct.txt')
    old=generate(client,m).json()
    assert client.delete(f'{BASE}/{m["id"]}/transcripts/{wrong["id"]}').status_code==200
    assert accept(client,m,old).status_code==409
    new=generate(client,m)
    assert new.status_code==200,new.text
    assert [f['file_name'] for f in calls[-1]['transcripts']]==['correct.txt']
    assert 'Wrong project information' not in json.dumps(calls[-1])
    assert accept(client,m,new.json()).status_code==200
