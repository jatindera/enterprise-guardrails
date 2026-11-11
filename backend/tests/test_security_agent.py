from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.agents.security import agent
from app.modules.security_preparation import execution


def test_security_agent_has_its_own_identity_and_instructions(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(agent, 'Agent', factory)
    agent.create_agent_with_client(object(), {'max_tokens': 1000})
    assert factory.call_args.kwargs['name'] == 'Enterprise_Security_Agent'
    assert 'Enterprise Security reviewer' in factory.call_args.kwargs['instructions']


@pytest.mark.parametrize('mode', ['local', 'ollama', 'hosted'])
def test_security_execution_uses_only_selected_security_path(monkeypatch, mode):
    monkeypatch.setenv('APP_EA_EXECUTION_MODE', 'hosted')
    monkeypatch.setenv('APP_EA_AGENT_NAME', 'enterprise-architecture-agent')
    monkeypatch.setenv('APP_SECURITY_EXECUTION_MODE', mode)
    monkeypatch.setenv('APP_SECURITY_AGENT_VERSION', '7')
    settings = SimpleNamespace(request_timeout_seconds=10)
    foundry = Mock(return_value=settings)
    monkeypatch.setattr(execution, 'FoundrySettings', foundry)
    monkeypatch.setattr(execution, 'OllamaSettings', lambda: settings)
    local = Mock(return_value='security agent')
    run = AsyncMock(return_value='local')
    ollama = AsyncMock(return_value='ollama')
    hosted = Mock(return_value='hosted')
    monkeypatch.setattr(execution, 'create_agent', local)
    monkeypatch.setattr(execution, 'run', run)
    monkeypatch.setattr(execution, 'run_ollama', ollama)
    monkeypatch.setattr(execution, 'invoke_hosted_agent', hosted)
    assert execution.invoke_security('payload') == mode
    if mode == 'hosted':
        target = hosted.call_args.args[2]
        assert target.agent_name == 'enterprise-security-agent'
        assert target.agent_version == '7'
    elif mode == 'ollama':
        ollama.assert_awaited_once_with('payload', settings)
        foundry.assert_not_called()
    else:
        local.assert_called_once_with(settings)
        run.assert_awaited_once_with('security agent', 'payload', 10)
    assert hosted.call_count + ollama.await_count + run.await_count == 1


def test_security_hosted_failure_does_not_fall_back(monkeypatch):
    monkeypatch.setenv('APP_SECURITY_EXECUTION_MODE', 'hosted')
    monkeypatch.setenv('APP_SECURITY_AGENT_VERSION', '7')
    monkeypatch.setattr(execution, 'FoundrySettings', lambda: object())
    monkeypatch.setattr(execution, 'invoke_hosted_agent', Mock(side_effect=TimeoutError))
    local = Mock()
    monkeypatch.setattr(execution, 'create_agent', local)
    with pytest.raises(TimeoutError):
        execution.invoke_security('payload')
    local.assert_not_called()


def test_ollama_sends_security_instructions_using_chat_completion(monkeypatch):
    import json
    import httpx

    def respond(request):
        body = json.loads(request.content)
        assert request.url.path == '/v1/chat/completions'
        assert body['model'] == 'test-model'
        assert body['max_completion_tokens'] == 1000
        assert body['response_format'] == {'type': 'json_object'}
        assert 'Enterprise Security reviewer' in str(body['messages'][0]['content'])
        return httpx.Response(200, json={
            'id': 'test', 'model': 'test-model', 'object': 'chat.completion', 'created': 0,
            'choices': [{'index': 0, 'finish_reason': 'stop',
                         'message': {'role': 'assistant', 'content': '{"text":"Security reply"}'}}],
        })

    def client(**kwargs):
        assert kwargs['trust_env'] is False
        return httpx.AsyncClient(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(execution, 'httpx', SimpleNamespace(AsyncClient=client))
    monkeypatch.setenv('APP_SECURITY_EXECUTION_MODE', 'ollama')
    monkeypatch.setenv('APP_OLLAMA_MODEL', 'test-model')
    monkeypatch.setenv('APP_OLLAMA_BASE_URL', 'http://127.0.0.1:11434/v1')
    monkeypatch.setenv('APP_OLLAMA_MAX_OUTPUT_TOKENS', '1000')
    assert execution.invoke_security('Security question') == '{"text":"Security reply"}'
