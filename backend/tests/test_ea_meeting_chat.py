import json
from unittest.mock import Mock
from uuid import UUID
import pytest
from app.core.auth import current_user
from app.modules.ea_preparation.router import hosted_invoker
from app.agents.enterprise_architecture.profiles import MEETING_CHAT
from test_meeting_preparation import setup_project, question, draft
from test_project_api import client, database


@pytest.mark.parametrize('roles,expected', [(['Admin'],200),(['general-users'],403),(['security-engineer'],403),(['enterprise-architect'],403)])
def test_meeting_chat_permissions(client,database,roles,expected):
    setup_project(client,database)
    invoke=Mock(return_value='{"text":"Clarify the business impact.","proposedQuestion":null}')
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(UUID(int=99)),'roles':roles}
    assert client.post('/api/projects/3601/ea-preparation/meeting-chat',json={'message':'Help'}).status_code==expected
    if expected==403:invoke.assert_not_called()


def test_meeting_profile_uses_current_ea_question_from_database(client,database):
    setup_project(client,database)
    ea=question('ea_current'); ea['question']='How is failover handled?'
    sec=question('sec_current','Security'); sec['question']='SECURITY ONLY QUESTION'
    assert client.put('/api/projects/3601/meeting-preparation/EA',json=draft(preparedQuestions=[ea],currentQuestionId='ea_current',askedQuestionIds=['ea_current'])).status_code==200
    assert client.put('/api/projects/3601/meeting-preparation/Security',json=draft(domain='Security',preparedQuestions=[sec],currentQuestionId='sec_current',askedQuestionIds=['sec_current'])).status_code==200
    invoke=Mock(return_value='{"text":"Ask about recovery testing.","proposedQuestion":{"question":"How is failover tested?","reason":"Validate recovery","priority":"Follow-up"}}')
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post('/api/projects/3601/ea-preparation/meeting-chat',json={'message':'What should I ask next?','history':[{'role':'user','text':'The team reported a recovery plan.'}]})
    assert r.status_code==200,r.text
    payload=json.loads(invoke.call_args.args[0])
    assert 'How is failover handled?' in payload['task']
    assert 'SECURITY ONLY QUESTION' not in payload['task']
    assert 'The team reported a recovery plan.' in payload['task']
    assert 'Do not assume a live audio feed' in payload['task']
    assert 'demand_id' not in payload['project_context']
    assert r.json()['proposedQuestion']['priority']=='Follow-up'


def test_additional_questions_persist_sources_and_asked_history(client,database):
    setup_project(client,database)
    manual=question('manual');manual.update(question='Who owns support?',source='manual')
    ai=question('ai');ai.update(question='How is failover tested?',source='ai')
    url='/api/projects/3601/meeting-preparation/EA'
    r=client.put(url,json=draft(preparedQuestions=[],additionalQuestions=[manual,ai]))
    assert r.status_code==200,r.text
    state=client.get(url).json()
    assert state['additionalQuestions']==[manual,ai]
    assert state['askedQuestionIds']==[]  # Adding a draft never claims it was spoken.
    r=client.put(url,json=draft(state['revision'],preparedQuestions=[],additionalQuestions=[manual,ai],
        currentQuestionId='ai',askedQuestionIds=['ai']))
    assert r.status_code==200
    restored=client.get(url).json()
    assert restored['currentQuestionId']=='ai' and restored['askedAt']['ai']
    assert restored['additionalQuestions'][0]['source']=='manual'


def test_meeting_without_current_question_and_invalid_reply(client,database):
    setup_project(client,database)
    invoke=Mock(return_value='{"text":"Which answer would you like to clarify?","proposedQuestion":null}')
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post('/api/projects/3601/ea-preparation/meeting-chat',json={'message':'Help clarify an answer.'})
    assert r.status_code==200
    assert '"current_question": null' in json.loads(invoke.call_args.args[0])['task']
    invoke.return_value='not JSON'
    assert client.post('/api/projects/3601/ea-preparation/meeting-chat',json={'message':'Help'}).status_code==502
    assert MEETING_CHAT.name=='conduct_meeting_chat'
