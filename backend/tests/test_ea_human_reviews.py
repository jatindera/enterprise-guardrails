import json
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import EAHumanReview, EAHumanReviewEvent, EAMeetingReview
from app.core.auth import current_user
from test_ea_review_history import client,database,setup,create as meeting_create,upload,state as meeting_state,generate,accept,reopen as ai_reopen
from test_ea_preparation import PRIMARY,HELPER
from test_project_api import payload

BASE='/api/projects/3601/ea-assessment'

def state(c):return c.get(BASE).json()

def source(c):
    meeting=meeting_create(c);upload(c,meeting)
    review=generate(c,meeting).json();assert accept(c,meeting,review).status_code==200
    return meeting,review

def draft(c,ai,uid=None,**extra):
    body=dict(sourceReviewId=ai['id'],expectedProjectRevision=state(c)['projectRevision'],**extra)
    return c.put(f'{BASE}/reviews/{uid or uuid4()}',json=body)

def save(c,row,uid=None,**changes):
    body={k:row[k] for k in ['reviewText','technologyStack','technologyRationale','complexity','decision','decisionRationale','conditions','diagramId','diagramConfirmed','diagramRequirement','diagramJustification','diagramOwner','diagramDueDate']}
    body.update(expectedRevision=row['revision'],**changes)
    return c.put(f'{BASE}/reviews/{row["id"]}/save/{uid or uuid4()}',json=body)

def ready(c,row,**changes):
    return save(c,row,diagramRequirement='Not applicable',diagramJustification='Minor configuration change with no architecture impact.',technologyStack='Power Apps',technologyRationale='Internal forms and reminders.',
        complexity='Low',decision='Approved',decisionRationale='Design inputs are sufficient for this scope.',**changes)

def submit(c,row,uid=None,**extra):
    return c.post(f'{BASE}/reviews/{row["id"]}/submit/{uid or uuid4()}',json=dict(
        expectedRevision=row['revision'],expectedProjectRevision=state(c)['projectRevision'],confirmed=True,**extra))

def reopen(c,row,uid=None,**extra):
    return c.post(f'{BASE}/reviews/{row["id"]}/reopen/{uid or uuid4()}',json=dict(
        expectedRevision=row['revision'],expectedProjectRevision=state(c)['projectRevision'],reason='New architecture information',**extra))

def test_separate_copy_unchanged_text_save_and_submission_persist(client,database,setup):
    _,ai=source(client)
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'name':'Primary EA','roles':['enterprise-architect']}
    row=draft(client,ai).json()
    assert row['reviewText']==ai['text'] and row['sourceReviewId']==ai['id']
    assert row['status']=='Draft' and row['decision'] is None and row['complexity'] is None
    row=ready(client,row).json()
    assert client.get('/api/projects/3601').json()['eaStatus']=='Pending'
    final=submit(client,row);assert final.status_code==200,final.text
    final=final.json()
    assert final['reviewText']==ai['text'] and final['status']=='Submitted'
    assert state(client)['currentReview']==final
    project=client.get('/api/projects/3601').json()
    assert project['eaStatus']=='Approved' and project['eaComplexity']=='Low'
    assert client.get('/api/projects').json()['items'][0]['eaStatus']=='Approved'
    with Session(database) as db:
        human=db.get(EAHumanReview,UUID(final['id']));original=db.get(EAMeetingReview,UUID(ai['id']))
        assert human.source_review_id==original.id and original.review_text==ai['text']
        assert original.status=='Accepted' and human.submitted_by==str(PRIMARY)
        assert len(list(db.scalars(select(EAHumanReviewEvent))))==3
    snapshots=client.get(f'{BASE}/reviews/{final["id"]}').json()['snapshots']
    assert [s['action'] for s in snapshots]==['Create','Save','Submit']
    assert snapshots[0]['review']['decision'] is None
    assert len(setup[1])==1  # Human persistence makes no additional inference call.


def test_human_edit_does_not_mutate_ai_and_save_conflicts(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json()
    updated=save(client,row,reviewText='Human conclusion, different from AI.');assert updated.status_code==200,updated.text
    assert save(client,row,reviewText='Stale editor overwrite').status_code==409
    assert state(client)['currentReview']['reviewText']=='Human conclusion, different from AI.'
    with Session(database) as db:assert db.get(EAMeetingReview,UUID(ai['id'])).review_text==ai['text']


def test_submitted_immutable_reopen_creates_new_draft_and_retains_history(client,database,setup):
    _,ai=source(client);row=ready(client,draft(client,ai).json()).json();final=submit(client,row).json()
    assert save(client,final,reviewText='Not allowed').status_code==409
    assert draft(client,ai,expectedCurrentReviewId=final['id'],expectedCurrentRevision=final['revision'],replaceDraft=True).status_code==409
    opened=reopen(client,final);assert opened.status_code==200,opened.text
    new=opened.json()
    assert new['id']!=final['id'] and new['parentReviewId']==final['id'] and new['version']==2
    assert new['reviewText']==final['reviewText'] and new['status']=='Draft'
    assert state(client)['eaStatus']=='Pending' and state(client)['eaComplexity']=='Not assessed'
    assert state(client)['history'][0]==final
    assert state(client)['events'][-1]['reason']=='New architecture information'
    assert reopen(client,final).status_code==409


@pytest.mark.parametrize('identity,roles',[(HELPER,['enterprise-architect']),(PRIMARY,['general-users']),(uuid4(),['enterprise-architect'])])
def test_only_primary_or_admin_can_write(client,database,setup,identity,roles):
    _,ai=source(client);row=draft(client,ai).json()
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(identity),'roles':roles}
    assert client.get(BASE).status_code==200
    assert state(client)['canEdit'] is False
    assert draft(client,ai).status_code==403
    assert save(client,row).status_code==403
    assert submit(client,row).status_code==403
    assert reopen(client,row).status_code==403


def test_admin_can_manage_and_author_is_taken_only_from_token(client,database,setup):
    _,ai=source(client)
    client.app.dependency_overrides[current_user]=lambda:{'objectId':'admin-id','name':'Verified admin','roles':['Admin']}
    row=draft(client,ai).json();assert row['createdBy']=='Verified admin'
    url=f'{BASE}/reviews/{row["id"]}/save/{uuid4()}'
    body=dict(expectedRevision=row['revision'],reviewText='Legitimate content',createdBy='Spoofed EA')
    assert client.put(url,json=body).status_code==422


def test_cross_project_sources_and_rows_are_rejected(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json()
    assert client.post('/api/projects/import',json=payload(demand_id='3602',name='Another project')).status_code==201
    other='/api/projects/3602/ea-assessment'
    assert client.put(f'{other}/reviews/{uuid4()}',json=dict(sourceReviewId=ai['id'],expectedProjectRevision=1)).status_code==404
    assert client.get(f'{other}/reviews/{row["id"]}').status_code==404
    assert client.put(f'{other}/reviews/{row["id"]}/save/{uuid4()}',json=dict(expectedRevision=1,reviewText='Wrong project')).status_code==404


def test_stale_ai_blocks_submission_but_preserves_saving_human_work(client,database,setup):
    meeting,ai=source(client);row=ready(client,draft(client,ai).json()).json()
    assert ai_reopen(client,meeting).status_code==200
    assert state(client)['sourceChanged'] is True
    assert submit(client,row).status_code==409
    preserved=save(client,row,reviewText='Human work retained during further discovery.').json()
    assert preserved['reviewText'].startswith('Human work retained')
    upload(client,meeting,'New stakeholder clarification.',name='meeting-2.txt')
    new_ai=generate(client,meeting).json();assert accept(client,meeting,new_ai).status_code==200
    assert state(client)['currentReview']['reviewText']==preserved['reviewText']
    assert state(client)['sourceChanged']
    replacement=draft(client,new_ai,expectedCurrentReviewId=preserved['id'],expectedCurrentRevision=preserved['revision'],replaceDraft=True)
    assert replacement.status_code==200,replacement.text
    assert state(client)['sourceChanged'] is False
    assert state(client)['history'][0]['status']=='Superseded'
    assert state(client)['history'][0]['reviewText']==preserved['reviewText']


def test_create_and_mutations_are_idempotent_not_duplicate_versions(client,database,setup):
    _,ai=source(client);uid=uuid4()
    first=draft(client,ai,uid);assert first.status_code==200,first.text
    assert draft(client,ai,uid).json()==first.json()
    row=first.json();sid=uuid4();saved=save(client,row,sid)
    assert saved.status_code==200 and save(client,row,sid).json()==saved.json()
    assert save(client,row,sid,reviewText='Different intent').status_code==409
    row=ready(client,saved.json()).json();sid=uuid4()
    final=submit(client,row,sid);assert final.status_code==200,final.text
    # An HTTP retry with the original project revision is safe.
    original_project_revision=state(client)['projectRevision']-1
    body=dict(expectedRevision=row['revision'],expectedProjectRevision=original_project_revision,confirmed=True)
    assert client.post(f'{BASE}/reviews/{row["id"]}/submit/{sid}',json=body).json()==final.json()
    final=final.json();rid=uuid4();project_rev=state(client)['projectRevision']
    opened=reopen(client,final,rid)
    body=dict(expectedRevision=final['revision'],expectedProjectRevision=project_rev,reason='New architecture information')
    assert client.post(f'{BASE}/reviews/{final["id"]}/reopen/{rid}',json=body).json()==opened.json()
    assert len(state(client)['history'])==2


def test_submit_requires_confirmation_fields_and_conditions(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json()
    assert submit(client,row).status_code==422
    url=f'{BASE}/reviews/{row["id"]}/submit/{uuid4()}'
    for confirmed in [False,'true',1]:
        assert client.post(url,json=dict(expectedRevision=row['revision'],expectedProjectRevision=state(client)['projectRevision'],confirmed=confirmed)).status_code==422
    row=ready(client,row).json()
    row=save(client,row,decision='Conditional approval',conditions='').json()
    assert submit(client,row).status_code==422
    row=save(client,row,conditions='Confirm licensing before procurement.').json()
    assert submit(client,row).status_code==200
    assert state(client)['eaStatus']=='Conditional approval'


def test_declined_decision_does_not_require_an_endorsed_stack(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json()
    row=save(client,row,complexity='Medium',decision='Rejected',decisionRationale='Requirements cannot be met.',technologyStack='').json()
    assert submit(client,row).status_code==200


def test_validation_and_stale_project_precondition(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json()
    for changes in [dict(reviewText='  '),dict(technologyStack='😀'*1500),dict(complexity='Critical'),dict(conditions='x'*4001)]:
        assert save(client,row,**changes).status_code==422
    row=ready(client,row).json()
    response=client.post(f'{BASE}/reviews/{row["id"]}/submit/{uuid4()}',json=dict(expectedRevision=row['revision'],expectedProjectRevision=999,confirmed=True))
    assert response.status_code==409
    assert state(client)['eaStatus']=='Pending'


def test_draft_or_stale_ai_is_not_a_valid_source(client,database,setup):
    meeting=meeting_create(client);upload(client,meeting);ai=generate(client,meeting).json()
    assert draft(client,ai).status_code==409
    assert accept(client,meeting,ai).status_code==200
    with Session(database) as db, db.begin():
        from app.db.models import Project
        project=db.scalar(select(Project));project.name='Changed context'
    assert draft(client,ai).status_code==409


def test_reopen_requires_nonblank_reason(client,database,setup):
    _,ai=source(client);row=submit(client,ready(client,draft(client,ai).json()).json()).json()
    assert client.post(f'{BASE}/reviews/{row["id"]}/reopen/{uuid4()}',json=dict(
        expectedRevision=row['revision'],expectedProjectRevision=state(client)['projectRevision'],reason=' ')).status_code==422
    assert state(client)['currentReview']['status']=='Submitted'


def test_ai_edit_endpoint_cannot_change_or_create_an_ai_version(client,database,setup):
    meeting,ai=source(client)
    url=f'/api/projects/3601/ea-review/meetings/{meeting["id"]}/reviews/{uuid4()}/edit'
    result=client.put(url,json=dict(expectedRevision=meeting_state(client,meeting)['revision'],parentReviewId=ai['id'],text='Do not overwrite AI'))
    assert result.status_code==410
    assert len(meeting_state(client,meeting)['reviews'])==1


def test_migration_preserves_existing_ai_and_intake_and_supports_roundtrip(client,database,setup,monkeypatch):
    from pathlib import Path
    from importlib.util import spec_from_file_location,module_from_spec
    from alembic.operations import Operations
    from alembic.migration import MigrationContext
    from sqlalchemy import inspect,text
    meeting,ai=source(client)
    with database.begin() as connection:
        operations=Operations(MigrationContext.configure(connection))
        operations.drop_table('ea_human_review_events');operations.drop_table('ea_human_reviews')
        operations.drop_column('projects','ea_complexity');operations.drop_column('projects','ea_status')
        spec=spec_from_file_location('human_migration',Path(__file__).parents[1]/'migrations/versions/20261102_ea_human_reviews.py')
        migration=module_from_spec(spec);spec.loader.exec_module(migration);monkeypatch.setattr(migration,'op',operations)
        migration.upgrade()
        assert {'ea_human_reviews','ea_human_review_events'} <= set(inspect(connection).get_table_names())
        assert connection.execute(text('SELECT ea_status,ea_complexity FROM projects')).one()==('Pending','Not assessed')
        assert connection.execute(text('SELECT review_text FROM ea_meeting_reviews')).scalar_one()==ai['text']
        migration.downgrade()
        assert 'ea_human_reviews' not in inspect(connection).get_table_names()
        migration.upgrade()
        operations.drop_table('ea_architecture_diagrams')
        spec=spec_from_file_location('diagram_migration',Path(__file__).parents[1]/'migrations/versions/20261103_ea_diagram_approval.py')
        diagrams=module_from_spec(spec);spec.loader.exec_module(diagrams);monkeypatch.setattr(diagrams,'op',operations)
        diagrams.upgrade()
    assert draft(client,ai).status_code==200
    assert meeting_state(client,meeting)['reviews'][0]['text']==ai['text']


def test_sqlalchemy_optimistic_revision_rejects_a_racing_update(client,database,setup):
    from sqlalchemy.orm.exc import StaleDataError
    _,ai=source(client);row=draft(client,ai).json()
    with Session(database) as a,Session(database) as b:
        first=a.get(EAHumanReview,UUID(row['id']));stale=b.get(EAHumanReview,UUID(row['id']))
        first.review_text='First editor';a.commit()
        stale.review_text='Second stale editor'
        with pytest.raises(StaleDataError):b.commit()
        b.rollback()
    assert state(client)['currentReview']['reviewText']=='First editor'


def test_actor_name_is_bounded_for_sql_unicode(client,database,setup):
    _,ai=source(client)
    client.app.dependency_overrides[current_user]=lambda:{'objectId':'admin','name':'😀'*200,'roles':['Admin']}
    row=draft(client,ai).json()
    assert len(row['createdBy'].encode('utf-16-le'))//2<=200


def test_submission_and_project_status_roll_back_if_audit_fails(client,database,setup,monkeypatch):
    from app.modules.ea_human_reviews import service as human
    from app.modules.ea_human_reviews.schemas import SubmitReview
    _,ai=source(client);row=ready(client,draft(client,ai).json()).json()
    project_revision=state(client)['projectRevision']
    original=human.audit
    def fail_after_flush(*args,**kwargs):
        original(*args,**kwargs)
        raise RuntimeError('Synthetic transaction failure')
    monkeypatch.setattr(human,'audit',fail_after_flush)
    with Session(database) as db:
        with pytest.raises(RuntimeError,match='Synthetic transaction failure'):
            human.submit(db,'3601',UUID(row['id']),uuid4(),SubmitReview(expected_revision=row['revision'],
                expected_project_revision=project_revision,confirmed=True),{'objectId':'test-admin','roles':['Admin']})
    restored=state(client)
    assert restored['currentReview']['status']=='Draft' and restored['eaStatus']=='Pending'
    assert restored['projectRevision']==project_revision
    assert [event['action'] for event in restored['events']]==['Create','Save']
