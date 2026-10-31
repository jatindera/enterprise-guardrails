import asyncio
import json
from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from openai.types.responses import Response
from app.agents.config import FoundrySettings
from app.agents.tools import public_query


@pytest.mark.parametrize('data',[
    {'query':'https://private.example.com','clarification':None},
    {'query':'user@example.com','clarification':None},
    {'query':'query','clarification':'question'},
    {'query':None,'clarification':None}, {'query':'x'*241},
    {'query':'x\ny'}, {'query':'10.0.0.1'},
])
def test_query_plan_validation(data):
    with pytest.raises(ValidationError):public_query.PublicQueryPlan.model_validate(data)


def test_public_product_query_and_clarification_are_valid():
    assert public_query.PublicQueryPlan(query='Microsoft Agent 365 SDK vulnerabilities').query
    assert public_query.PublicQueryPlan(clarification='Which public SDK?').clarification


def test_obvious_secret_scrubbing():
    text=public_query.scrub_obvious_secrets('Agent 365 token=abc123 user@example.com https://private.example.com')
    assert 'abc123' not in text and 'user@example.com' not in text and 'private.example.com' not in text
    assert 'Agent 365' in text


def test_long_message_clarifies_without_model_request(monkeypatch):
    monkeypatch.setattr(public_query,'ManagedFoundryChatClient',lambda _:pytest.fail('No model call expected'))
    assert public_query.plan_public_search('x'*2001).clarification


def test_real_maf_query_preparation_has_no_tools_and_bounded_output(monkeypatch):
    monkeypatch.delenv('ALL_PROXY',raising=False);monkeypatch.delenv('all_proxy',raising=False)
    settings=FoundrySettings(_env_file=None,project_endpoint='https://example.services.ai.azure.com/api/projects/test',model_deployment_name='model')
    raw=Response.model_validate({'id':'resp_1','created_at':0,'object':'response','model':'model','status':'completed',
        'parallel_tool_calls':False,'tool_choice':'none','tools':[],'output':[{'id':'msg_1','type':'message','role':'assistant',
        'status':'completed','content':[{'type':'output_text','text':'{"query":"Microsoft Agent 365 SDK published vulnerabilities","clarification":null}','annotations':[]}]}]})
    actual=public_query.ManagedFoundryChatClient
    requests=[]
    def factory(config):
        client=actual(config)
        async def respond(**kwargs):
            requests.append(kwargs)
            return SimpleNamespace(parse=lambda:raw,headers={})
        monkeypatch.setattr(client.client.responses.with_raw_response,'create',respond)
        return client
    monkeypatch.setattr(public_query,'ManagedFoundryChatClient',factory)
    result=asyncio.run(public_query._plan('Top 2 vulnerabilities of Agent 365 SDK? token=SECRET',settings))
    assert result.query.startswith('Microsoft Agent 365')
    assert len(requests)==1
    request=requests[0]
    # MAF omits tool_choice when no tools are declared.
    assert not request.get('tools') and request.get('tool_choice', 'none') == 'none'
    assert request['max_output_tokens']==512 and request['store'] is False
    assert 'SECRET' not in json.dumps(request['input'])
