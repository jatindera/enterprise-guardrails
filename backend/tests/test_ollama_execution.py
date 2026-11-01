import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock
import httpx
import pytest
from pydantic import ValidationError
from openai import AsyncOpenAI
from app.agents import ollama
from app.modules.ea_preparation import execution
from app.modules.ea_preparation.errors import EAInferenceError


def test_dispatch_ollama_never_uses_azure(monkeypatch):
    monkeypatch.setenv('APP_EA_EXECUTION_MODE','ollama')
    run=Mock(return_value='local result')
    azure=Mock(side_effect=AssertionError('Azure must not be called'))
    monkeypatch.setattr(ollama,'invoke_ollama',run)
    monkeypatch.setattr(execution,'invoke_local',azure)
    monkeypatch.setattr(execution,'invoke_hosted',azure)
    assert execution.invoke_ea('payload')=='local result'
    run.assert_called_once_with('payload')
    run.side_effect=RuntimeError('Ollama stopped')
    with pytest.raises(RuntimeError): execution.invoke_ea('payload')
    azure.assert_not_called()


@pytest.mark.parametrize('url',[
    'https://api.openai.com/v1','http://example.com/v1',
    'http://localhost:11434/api','http://user:pass@localhost:11434/v1',
    'http://localhost:11434/v1?redirect=example',
])
def test_remote_endpoints_rejected(url):
    with pytest.raises(ValidationError):
        ollama.OllamaSettings(_env_file=None,model='local-test',base_url=url)


@pytest.mark.parametrize('model',['','test:cloud',' model with spaces '])
def test_cloud_or_invalid_models_rejected(model):
    with pytest.raises(ValidationError): ollama.OllamaSettings(_env_file=None,model=model)


@pytest.mark.parametrize('reason',['stop','length'])
def test_real_maf_chat_completion_roundtrip_without_foundry(monkeypatch,reason):
    calls=[]
    def handle(request):
        calls.append(json.loads(request.content))
        assert request.url.host=='localhost'
        assert request.url.path=='/v1/chat/completions'
        return httpx.Response(200,json={
            'id':'chat-test','object':'chat.completion','created':1,'model':'local-test',
            'choices':[{'index':0,'message':{'role':'assistant','content':'{"text":"Local answer"}'},
                        'finish_reason':reason}],
            'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}})
    def factory(**kwargs):
        # Exercise real MAF, SDK serialization and response parsing, replacing
        # only the HTTP transport. No local server or Azure resource is needed.
        kwargs['http_client']=httpx.AsyncClient(transport=httpx.MockTransport(handle),trust_env=False)
        return AsyncOpenAI(**kwargs)
    monkeypatch.setattr(ollama,'AsyncOpenAI',factory)
    settings=ollama.OllamaSettings(_env_file=None,model='local-test')
    if reason=='length':
        with pytest.raises(EAInferenceError):
            asyncio.run(ollama._run_ollama('Task and context',settings))
    else:
        assert asyncio.run(ollama._run_ollama('Task and context',settings))=='{"text":"Local answer"}'
    assert calls[0]['model']=='local-test'
    assert 'Task and context' in json.dumps(calls[0]['messages'])
    assert 'Enterprise_Architecture_Agent' in json.dumps(calls[0]['messages'])


def test_review_schema_is_sent_to_ollama_and_does_not_leak_to_chat(monkeypatch):
    calls=[]
    def handle(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200,json={
            'id':'chat-test','object':'chat.completion','created':1,'model':'local-test',
            'choices':[{'index':0,'message':{'role':'assistant','content':'{"summary":"draft"}'},
                'finish_reason':'stop'}]})
    def factory(**kwargs):
        kwargs['http_client']=httpx.AsyncClient(transport=httpx.MockTransport(handle),trust_env=False)
        return AsyncOpenAI(**kwargs)
    monkeypatch.setattr(ollama,'AsyncOpenAI',factory)
    settings=ollama.OllamaSettings(_env_file=None,model='local-test')
    with ollama.structured_review_output():
        asyncio.run(ollama._run_ollama('Review the supplied transcripts',settings))
    asyncio.run(ollama._run_ollama('Ordinary chat',settings))
    fmt=calls[0]['response_format']
    assert fmt['type']=='json_schema' and fmt['json_schema']['strict'] is True
    schema=fmt['json_schema']['schema']
    assert schema['properties']['findings']['maxItems']==12
    assert schema['$defs']['SourceReference']['properties']['kind']['const']=='transcript'
    assert 'quote' not in schema['$defs']['SourceReference']['properties']
    assert 'prepared_question_id' not in schema['$defs']['ReferencedFinding']['properties']
    assert calls[0]['temperature']==0
    assert 'response_format' not in calls[1]


def test_review_scope_resets_after_exception():
    with pytest.raises(RuntimeError):
        with ollama.structured_review_output():
            assert ollama._review_schema.get()
            raise RuntimeError('Failed')
    assert ollama._review_schema.get() is None
