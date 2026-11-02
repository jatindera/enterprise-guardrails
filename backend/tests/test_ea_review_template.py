"""Standard review contract and persistence, with no live model/storage calls."""
import json
from copy import deepcopy
from uuid import UUID, uuid4
import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.db.models import EAMeetingReview
from app.modules.ea_meeting_reviews.schemas import ReferencedReview, ReviewResult
from app.modules.ea_meeting_reviews.service import render
from app.modules.ea_meeting_reviews.template import HEADINGS
from app.modules.ea_preparation.router import hosted_invoker
from app.agents.enterprise_architecture.profiles import MEETING_REVIEW
from test_ea_review_history import client, database, setup, create, upload, state, generate, accept


def response(source_id):
    return dict(template_version='2.0', summary='Internal supplier document tracking; scope is stakeholder-reported.',
        technology_review=dict(status='Reviewed', feedback='Evaluate the proposal against access and retention requirements.',
            alternatives=['A smaller workflow solution may reduce operations effort.'],
            trade_offs=['Customization increases maintenance effort.']),
        readiness=dict(status='Needs clarification', reason='Retention statements conflict and affect design.'),
        findings=[dict(kind='requirement', text='Internal users only.',
            citations=[dict(kind='transcript', id=source_id, line=1)]),
            dict(kind='contradiction', text='Five and seven years are both reported; confirm the governing requirement.',
                citations=[dict(kind='transcript', id=source_id, line=2), dict(kind='transcript', id=source_id, line=3)])],
        follow_up_questions=['Which retention requirement applies, and who confirms it?'])


def test_template_is_required_for_new_inference_and_has_bounded_fields():
    value=response(str(uuid4()))
    assert ReferencedReview.model_validate(value).template_version=='2.0'
    for key in ('template_version','readiness'):
        bad=deepcopy(value);bad.pop(key)
        with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)
    for key in ('alternatives','trade_offs'):
        bad=deepcopy(value);bad['technology_review'].pop(key)
        with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)
        bad=deepcopy(value);bad['technology_review'][key]=['x']*4
        with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)
    for questions in ([' '], ['x']*7, ['x'*501]):
        bad=deepcopy(value);bad['follow_up_questions']=questions
        with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)


def test_readiness_is_not_approval_and_clarification_requires_questions():
    value=response(str(uuid4()))
    for invalid in ('Approved','Rejected','Reviewed'):
        bad=deepcopy(value);bad['readiness']['status']=invalid
        with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)
    bad=deepcopy(value);bad['follow_up_questions']=[]
    with pytest.raises(ValidationError): ReferencedReview.model_validate(bad)
    value['readiness']={'status':'Ready for human assessment','reason':'Design inputs are sufficient; implementation tests remain pending.'}
    value['follow_up_questions']=[]
    assert ReferencedReview.model_validate(value).readiness.status=='Ready for human assessment'
    value['technology_review']['status']='Needs clarification'
    with pytest.raises(ValidationError): ReferencedReview.model_validate(value)


def test_standard_template_persists_and_reference_sections_are_deterministic(client,database,setup):
    _,calls=setup
    m=create(client);upload(client,m,'Internal users only.\nFive years.\nSeven years.',name='discovery.txt')
    def invoke(raw):
        payload=json.loads(raw);calls.append(payload)
        return json.dumps(response(payload['transcripts'][0]['id']))
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    result=generate(client,m)
    assert result.status_code==200,result.text
    text=result.json()['text']
    assert [text.index(h) for h in HEADINGS]==sorted(text.index(h) for h in HEADINGS)
    for h in HEADINGS: assert text.count(h)==1
    assert 'Readiness: Needs clarification' in text
    assert '[E2, E3]' in text
    assert 'Source: E1 | discovery.txt | transcript' in text
    assert 'line 2: "Five years."' in text and 'line 3: "Seven years."' in text
    assert 'Which retention requirement' in text
    assert 'not project approval' in text
    with Session(database) as db:
        row=db.get(EAMeetingReview,UUID(result.json()['id']))
        stored=json.loads(row.ai_result)
        assert stored['template_version']=='2.0' and stored['readiness']['status']=='Needs clarification'
        assert stored['technology_review']['alternatives']
        assert stored['findings'][1]['citations'][1]['quote']=='Seven years.'
        assert row.profile_version=='2.0.0'
    assert state(client,m)['reviews'][-1]['text']==text
    assert len(calls)==1  # no second formatter/reviewer model call
    # Readiness is advisory, not a new permission/approval gate.
    assert accept(client,m,result.json()).status_code==200


def test_missing_new_schema_fields_fails_without_creating_a_draft(client,database,setup):
    m=create(client);upload(client,m)
    def invoke(raw):
        value=response(json.loads(raw)['transcripts'][0]['id']);value.pop('readiness')
        return json.dumps(value)
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    result=generate(client,m)
    assert result.status_code==502 and 'invalid_schema' in result.text
    assert state(client,m)['reviews'][-1]['status']=='Failed'


def test_legacy_result_rendering_remains_available():
    source_id=uuid4()
    legacy=ReviewResult(summary='Legacy review summary.',findings=[dict(kind='requirement',text='Internal access.',
        citations=[dict(kind='transcript',id=source_id,line=1,quote='Internal access.')])])
    text=render(legacy,{('transcript',str(source_id)):'old.txt'})
    assert 'Legacy review summary.' in text and 'old.txt' in text
    assert 'Review template: 2.0' not in text


def test_profile_is_bounded_and_protects_human_authority():
    assert MEETING_REVIEW.version=='2.0.0'
    text=MEETING_REVIEW.render()
    assert len(text)<16000
    for instruction in ('600 words','CURRENT proposal','NOT approval','never instructions','Ready for human assessment'):
        assert instruction in text


def test_ollama_receives_the_same_new_schema_without_changing_chat():
    from app.agents.ollama import structured_review_output, _review_schema
    assert _review_schema.get() is None
    with structured_review_output():
        schema=_review_schema.get()
        assert {'readiness','template_version'} <= set(schema['required'])
        assert schema['$defs']['Readiness']['properties']['status']['enum']==['Needs clarification','Ready for human assessment']
    assert _review_schema.get() is None
