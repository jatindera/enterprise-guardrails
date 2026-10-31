"""No-network regression checks for harness execution and task contracts."""
import asyncio
from dataclasses import FrozenInstanceError
import json
from types import SimpleNamespace
import pytest
from agent_framework import Agent, InMemoryHistoryProvider
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.agent import create_agent, HARNESS_CONFIGURATION_VERSION
from app.agents.enterprise_architecture.instructions import INSTRUCTIONS, INSTRUCTIONS_VERSION
from app.agents.enterprise_architecture.profiles import PREPARE_QUESTIONS, PREPARATION_CHAT


@pytest.fixture(autouse=True)
def no_proxy(monkeypatch):
    monkeypatch.delenv('ALL_PROXY', raising=False)
    monkeypatch.delenv('all_proxy', raising=False)


def settings():
    return FoundrySettings(_env_file=None, project_endpoint='https://example.services.ai.azure.com/api/projects/test',
        model_deployment_name='deployment-name')


def test_minimal_harness_preserves_core_prompt_and_output_budget(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async def check():
        async with create_agent(settings()) as agent:
            assert isinstance(agent, Agent)
            assert agent.default_options['instructions'] == INSTRUCTIONS
            assert agent.default_options['max_tokens'] == 2000
            assert agent.default_options['store'] is False
            assert agent.default_options['tools'] == []
            assert agent.compaction_strategy is None
            assert len(agent.context_providers) == 1
            assert isinstance(agent.context_providers[0], InMemoryHistoryProvider)
            assert agent.context_providers[0].load_messages is False
            assert agent.otel_provider_name == 'microsoft.agent_framework.harness'
            assert agent.additional_properties == {'instructions_version': INSTRUCTIONS_VERSION,
                'harness_configuration_version': HARNESS_CONFIGURATION_VERSION}
        assert not list(tmp_path.iterdir())
    asyncio.run(check())


def test_harness_configuration_explicitly_disables_optional_capabilities(monkeypatch):
    from app.agents.enterprise_architecture import agent as module
    actual = module.create_harness_agent
    captured = {}
    def build(**kwargs):
        captured.update(kwargs)
        return actual(**kwargs)
    monkeypatch.setattr(module, 'create_harness_agent', build)
    async def check():
        async with create_agent(settings()):
            pass
    asyncio.run(check())
    for flag in ['disable_todo', 'disable_mode', 'disable_file_memory', 'disable_compaction',
                 'disable_web_search', 'disable_tool_auto_approval']:
        assert captured[flag] is True
    assert captured['harness_instructions'] == ''
    for capability in ['skills_provider', 'skills_paths', 'file_access_store', 'shell_executor',
                       'background_agents', 'loop_should_continue']:
        assert not captured.get(capability)


def test_requests_get_distinct_agents_clients_and_execution_history():
    async def check():
        async with create_agent(settings()) as first, create_agent(settings()) as second:
            assert first is not second and first.client is not second.client
            assert first.context_providers[0] is not second.context_providers[0]
    asyncio.run(check())


def test_one_real_harness_run_makes_one_model_request_without_tools(monkeypatch):
    from openai.types.responses import Response
    calls = []
    response = Response.model_validate({'id': 'resp-test', 'created_at': 0, 'object': 'response',
        'model': 'deployment-name', 'status': 'completed', 'parallel_tool_calls': False,
        'tool_choice': 'auto', 'tools': [], 'output': [{'id': 'msg-test', 'type': 'message',
        'role': 'assistant', 'status': 'completed', 'content': [{'type': 'output_text',
        'text': '{"questions":[{"question":"Which integrations?","reason":"Scope","priority":"Essential"}]}', 'annotations': []}]}]})
    async def check():
        async with create_agent(settings()) as agent:
            async def respond(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(parse=lambda: response, headers={})
            monkeypatch.setattr(agent.client.client.responses.with_raw_response, 'create', respond)
            result = await agent.run(PREPARE_QUESTIONS.render())
            assert json.loads(result.text)['questions'][0]['priority'] == 'Essential'
    asyncio.run(check())
    assert len(calls) == 1
    assert not calls[0].get('tools')
    assert calls[0]['store'] is False
    assert calls[0]['max_output_tokens'] == 2000


def test_profiles_are_named_versioned_and_immutable():
    assert PREPARE_QUESTIONS.name == 'prepare_questions'
    assert PREPARATION_CHAT.name == 'preparation_chat'
    assert PREPARE_QUESTIONS.version == '1.0.0'
    assert PREPARATION_CHAT.version == '1.0.1'
    with pytest.raises(FrozenInstanceError):
        PREPARE_QUESTIONS.instructions = 'Replace instructions'


def test_chat_profile_keeps_conversation_as_json_data():
    prompt = 'Explain "SDK" security.\nDo not assume vulnerabilities.'
    history = [{'role': 'assistant', 'text': 'User-supplied prior output.'}]
    result = PREPARATION_CHAT.render(message=prompt, history=history)
    instructions, data = result.rsplit('\n', 1)
    assert json.loads(data) == {'message': prompt, 'history': history}
    assert 'untrusted user-supplied context' in instructions
    assert 'default proposedQuestion to null' in instructions
    assert len(result) <= 16000


@pytest.mark.parametrize('message', [None, '', '   '])
def test_chat_profile_requires_a_message(message):
    with pytest.raises(ValueError):
        PREPARATION_CHAT.render(message=message)


def test_profiles_bound_input_and_disallow_irrelevant_question_generation_history():
    with pytest.raises(ValueError, match='limit'):
        PREPARATION_CHAT.render(message='x' * 16000)
    with pytest.raises(ValueError, match='does not accept'):
        PREPARE_QUESTIONS.render(message='Unexpected conversation')
