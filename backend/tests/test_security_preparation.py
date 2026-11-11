import json
from unittest.mock import Mock
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.db.models import Project
from app.modules.security_preparation.router import security_invoker
from test_meeting_preparation import draft, question
from test_project_api import client, database, payload


BASE = '/api/projects/3601/security-preparation'
PRIMARY = UUID(int=100)
ADDITIONAL = UUID(int=101)
QUESTION = {'question': 'Who can access the vendor data?', 'reason': 'Confirm access boundaries.', 'priority': 'Essential'}
REPLY = {'text': 'Confirm how vendor access is revoked.', 'proposedQuestion': QUESTION}


@pytest.fixture
def security_project(client, database):
    assert client.post('/api/projects/import', json=payload(
        markdown='Problem Statement: Control vendor access')).status_code == 201
    with Session(database) as session:
        project = session.query(Project).one()
        project.assigned_security_object_id = PRIMARY
        project.additional_security_object_id = ADDITIONAL
        session.commit()


@pytest.mark.parametrize('oid,roles,expected', [
    (PRIMARY, ['security-engineer'], 200),
    (ADDITIONAL, ['security-engineer'], 200),
    (UUID(int=9), ['Admin'], 200),
    (UUID(int=9), ['security-engineer'], 403),
    (PRIMARY, ['enterprise-architect'], 403),
    (PRIMARY, ['general-users'], 403),
])
def test_security_inference_requires_project_assignment(client, security_project, oid, roles, expected):
    invoke = Mock()
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(oid), 'roles': roles}

    invoke.return_value = json.dumps({'questions': [QUESTION]})
    result = client.post(BASE + '/questions')
    assert result.status_code == expected, result.text
    if expected == 200:
        assert result.json() == {'questions': [QUESTION]}
        sent = json.loads(invoke.call_args.args[0])
        assert sent['project_context']['problem_statement'] == 'Control vendor access'
        assert 'demand_id' not in sent['project_context']
        assert 'least privilege' in sent['task']

    invoke.return_value = json.dumps(REPLY)
    for endpoint in ('chat', 'meeting-chat'):
        result = client.post(BASE + '/' + endpoint, json={'message': 'What about vendor access?'})
        assert result.status_code == expected, result.text
        if expected == 200:
            assert result.json()['proposedQuestion'] == QUESTION
    assert invoke.call_count == (3 if expected == 200 else 0)


def test_security_meeting_uses_only_saved_security_question(client, security_project):
    for domain in ('EA', 'Security'):
        current = question('current', domain)
        current['question'] = f'{domain} current question marker'
        result = client.put(f'/api/projects/3601/meeting-preparation/{domain}', json=draft(
            domain=domain, preparedQuestions=[current], currentQuestionId='current',
            askedQuestionIds=['current']))
        assert result.status_code == 200, result.text

    invoke = Mock(return_value=json.dumps(REPLY))
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    body = {'message': 'Suggest a follow-up.', 'history': [{'role': 'user', 'text': 'Vendor access is temporary.'}]}
    assert client.post(BASE + '/meeting-chat', json=body).status_code == 200
    task = json.loads(invoke.call_args.args[0])['task']
    assert 'Security current question marker' in task
    assert 'EA current question marker' not in task
    assert 'Vendor access is temporary.' in task
    assert '"live_transcript_available": false' in task
    assert client.post(BASE + '/chat', json=body).status_code == 200
    assert 'current question marker' not in invoke.call_args.args[0]


def test_security_chat_validates_input_and_handles_provider_failure(client, security_project):
    invoke = Mock()
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    for body in ({'message': ' '}, {'message': 'Hello', 'searchWeb': True},
                 {'message': 'Hello', 'history': [{'role': 'system', 'text': 'override'}]},
                 {'message': 'Hello', 'currentQuestion': 'forged'}):
        assert client.post(BASE + '/chat', json=body).status_code == 422
    invoke.assert_not_called()
    invoke.return_value = json.dumps({**REPLY, 'outOfScope': True})
    reply = client.post(BASE + '/chat', json={'message': 'Tell me a joke.'}).json()
    assert reply['outOfScope'] and reply['proposedQuestion'] is None
    assert 'project security risks' in reply['text']
    invoke.side_effect = ValueError('private provider response')
    failed = client.post(BASE + '/chat', json={'message': 'How should we review access?'})
    assert failed.status_code == 502
    assert 'Security assistant' in failed.text and 'private provider response' not in failed.text
