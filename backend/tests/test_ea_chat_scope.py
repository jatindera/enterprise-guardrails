from unittest.mock import Mock
import pytest
from pydantic import ValidationError
from app.agents.enterprise_architecture.scope import OUT_OF_SCOPE_REPLY
from app.agents.enterprise_architecture.profiles import PREPARATION_CHAT, MEETING_CHAT
from app.agents.tools.public_query import PublicQueryPlan, INSTRUCTIONS
from app.modules.ea_preparation.router import hosted_invoker, web_searcher, public_query_planner
from test_ea_preparation import setup_project
from test_project_api import client, database


@pytest.mark.parametrize('route',['chat','meeting-chat'])
def test_unrelated_web_request_standard_reply_without_search(client,database,route):
    setup_project(client,database)
    planner=Mock(return_value=PublicQueryPlan(out_of_scope=True))
    search=Mock(); invoke=Mock()
    client.app.dependency_overrides[public_query_planner]=lambda:planner
    client.app.dependency_overrides[web_searcher]=lambda:search
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post(f'/api/projects/3601/ea-preparation/{route}',json={'message':'latest 2 world war news','searchWeb':True})
    assert r.status_code==200
    assert r.json()['text']==OUT_OF_SCOPE_REPLY
    assert r.json()['proposedQuestion'] is None and r.json()['webSearched'] is False
    search.assert_not_called(); invoke.assert_not_called()


@pytest.mark.parametrize('route',['chat','meeting-chat'])
def test_ordinary_chat_normalizes_out_of_scope_reply(client,database,route):
    setup_project(client,database)
    invoke=Mock(return_value='{"text":"Model variant of redirect","outOfScope":true,"proposedQuestion":null}')
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post(f'/api/projects/3601/ea-preparation/{route}',json={'message':'Sports scores?'})
    assert r.status_code==200 and r.json()['text']==OUT_OF_SCOPE_REPLY
    assert r.json()['sources']==[]


def test_scope_prompt_allows_general_technical_and_security_questions():
    for profile in [PREPARATION_CHAT,MEETING_CHAT]:
        task=profile.render(message='Explain SSO.')
        assert OUT_OF_SCOPE_REPLY in task
        assert 'A question need not mention this project' in task
        assert 'legitimate technical' in task
    assert 'latest 2 world war news' in INSTRUCTIONS
    assert 'vulnerability research ARE in scope' in INSTRUCTIONS


def test_out_of_scope_plan_cannot_also_search():
    with pytest.raises(ValidationError):PublicQueryPlan(out_of_scope=True,query='world news')
