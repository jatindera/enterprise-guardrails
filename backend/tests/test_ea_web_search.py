import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from openai.types.responses import Response
from app.agents.config import FoundrySettings
from app.agents.tools import public_web
from app.modules.ea_preparation.router import hosted_invoker, web_searcher
from app.core.auth import current_user
from test_ea_preparation import setup_project, PRIMARY
from test_project_api import client, database


def evidence():
    return public_web.WebEvidence(text='Published advisory; verify affected version [1].',
        sources=[{'title':'Microsoft security advisory','url':'https://msrc.microsoft.com/update-guide'}],
        searched_at='2026-10-31T09:00:00+00:00')


def test_public_query_is_only_search_input_and_evidence_reaches_ea(client, database):
    setup_project(client, database)
    search = Mock(return_value=evidence())
    invoke = Mock(return_value=json.dumps({'text':'Check the affected version [1].','proposedQuestion':None}))
    client.app.dependency_overrides[web_searcher] = lambda: search
    client.app.dependency_overrides[hosted_invoker] = lambda: invoke
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Our confidential project uses this SDK.',
        'history':[{'role':'user','text':'Internal meeting notes'}], 'searchWeb':True,
        'publicSearchQuery':'Microsoft Agent 365 SDK security advisories'})
    assert r.status_code==200, r.text
    search.assert_called_once_with('Microsoft Agent 365 SDK security advisories')
    assert 'public_web_evidence' in invoke.call_args.args[0]
    assert 'Internal meeting notes' in invoke.call_args.args[0]
    assert r.json()['sources']==evidence().sources
    assert r.json()['webSearched'] is True


def test_search_off_and_question_generation_never_search(client, database):
    setup_project(client,database)
    search=Mock()
    invoke=Mock(return_value='{"text":"No search performed.","proposedQuestion":null}')
    client.app.dependency_overrides[web_searcher]=lambda:search
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Hello'})
    assert r.status_code==200
    assert r.json()['sources']==[] and r.json()['webSearched'] is False
    invoke.return_value='{"questions":[{"question":"Scope?","reason":"Clarify","priority":"Essential"}]}'
    assert client.post('/api/projects/3601/ea-preparation/questions').status_code==200
    search.assert_not_called()


@pytest.mark.parametrize('query',[None,'',' ', 'user@example.com','https://internal.example.com', '10.0.0.1 system', 'x'*241, 'line\nbreak'])
def test_invalid_public_queries_never_search(client,database,query):
    setup_project(client,database)
    search=Mock()
    client.app.dependency_overrides[web_searcher]=lambda:search
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Hi','searchWeb':True,'publicSearchQuery':query})
    assert r.status_code==422
    search.assert_not_called()


def test_unauthorized_search_denied_before_tool_call(client,database):
    setup_project(client,database)
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(PRIMARY),'roles':['general-users']}
    search=Mock()
    client.app.dependency_overrides[web_searcher]=lambda:search
    assert client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Hi','searchWeb':True,'publicSearchQuery':'SDK security'}).status_code==403
    search.assert_not_called()


def test_search_failure_no_silent_fallback_or_error_detail(client,database):
    setup_project(client,database)
    search=Mock(side_effect=RuntimeError('SECRET'))
    invoke=Mock()
    client.app.dependency_overrides[web_searcher]=lambda:search
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Hi','searchWeb':True,'publicSearchQuery':'SDK security'})
    assert r.status_code==502 and 'SECRET' not in r.text
    invoke.assert_not_called()


@pytest.mark.parametrize('url',['javascript:alert(1)','http://example.com','https://user:pass@example.com','https://127.0.0.1',
    'https://host.internal','https://localhost','https://example.com:22','https://example.com/ bad'])
def test_source_links_reject_unsafe_urls(url):
    assert not public_web.safe_public_url(url)


@pytest.mark.parametrize('has_call,has_citation',[(True,True),(True,False),(False,False)])
def test_real_maf_search_request_limits_and_provider_annotations(monkeypatch,has_call,has_citation):
    monkeypatch.delenv('ALL_PROXY',raising=False);monkeypatch.delenv('all_proxy',raising=False)
    settings=FoundrySettings(_env_file=None,project_endpoint='https://example.services.ai.azure.com/api/projects/test',model_deployment_name='model')
    output=[]
    if has_call:output.append({'id':'ws_1','type':'web_search_call','status':'completed','action':{'type':'search','query':'SDK advisories'}})
    output.append({'id':'msg_1','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text',
        'text':'Check advisory [1].','annotations':[{'type':'url_citation','url':'https://msrc.microsoft.com/update-guide',
        'title':'Microsoft security advisory','start_index':0,'end_index':14}] if has_citation else []}]})
    raw=Response.model_validate({'id':'resp_1','created_at':0,'object':'response','model':'model','status':'completed',
        'parallel_tool_calls':False,'tool_choice':'required','tools':[],'output':output})
    original=public_web.ManagedFoundryChatClient
    requests=[]
    def factory(config):
        client=original(config)
        async def respond(**kwargs):
            requests.append(kwargs)
            return SimpleNamespace(parse=lambda:raw,headers={})
        monkeypatch.setattr(client.client.responses.with_raw_response,'create',respond)
        return client
    monkeypatch.setattr(public_web,'ManagedFoundryChatClient',factory)
    if not has_call:
        with pytest.raises(ValueError,match='not completed'):asyncio.run(public_web._search('SDK advisories',settings))
    else:
        result=asyncio.run(public_web._search('SDK advisories',settings))
        assert bool(result.sources)==has_citation
        if not has_citation:assert 'No published finding is verified' in result.text
    assert len(requests)==1
    request=requests[0]
    assert request['max_tool_calls']==1 and request['tool_choice']=='required'
    assert request['store'] is False and request['max_output_tokens']==1200
    assert request['tools'][0]['type']=='web_search'
    assert request['tools'][0]['search_context_size']=='low'
    assert 'SDK advisories' in json.dumps(request['input'])


def test_long_chat_rejected_before_paid_search(client,database):
    setup_project(client,database)
    search=Mock()
    client.app.dependency_overrides[web_searcher]=lambda:search
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'x'*6500,'searchWeb':True,'publicSearchQuery':'SDK advisories'})
    assert r.status_code==422
    search.assert_not_called()


def test_provider_citations_override_model_invented_sources(client,database):
    setup_project(client,database)
    client.app.dependency_overrides[web_searcher]=lambda:lambda query:evidence()
    invoke=Mock(return_value=json.dumps({'text':'Published finding [1].','proposedQuestion':None,
        'sources':[{'title':'Invented','url':'https://example.com/fake'}], 'webSearched':False}))
    client.app.dependency_overrides[hosted_invoker]=lambda:invoke
    r=client.post('/api/projects/3601/ea-preparation/chat',json={'message':'Hi','searchWeb':True,'publicSearchQuery':'SDK advisories'})
    assert r.status_code==200 and r.json()['sources']==evidence().sources
