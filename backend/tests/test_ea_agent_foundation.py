"""SDK and boundary tests; no Azure token or model request is made."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from pydantic import ValidationError
from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.agent import create_agent
from app.agents.enterprise_architecture.context import EAProjectContext, preparation_input
from app.agents.enterprise_architecture.service import ask
from app.agents.enterprise_architecture.host import build_server


def settings(**overrides):
    return FoundrySettings(_env_file=None, project_endpoint='https://example.services.ai.azure.com/api/projects/test',
        model_deployment_name='deployment-name', **overrides)


def context():
    return EAProjectContext.model_validate({
        'demand_id': '3845', 'project_name': 'Reporting', 'business_function': 'IT',
        'intake': {
            'version': {'snapshotId': '00000000-0000-0000-0000-000000000001', 'sourceSystem': 'sharepoint',
                'sourceItemId': '42', 'sourceUrl': None, 'sourceModifiedAt': None, 'sourceEtag': None,
                'sourceFileName': '', 'importedAt': '2026-10-30T00:00:00Z', 'structured': True},
            'facts': {'problemStatement': 'Manual reporting', 'aiEffort': False},
            'stakeholders': [], 'comments': [], 'sourceFields': [], 'parsingWarnings': [],
        },
    })


@pytest.fixture(autouse=True)
def no_network_proxy(monkeypatch):
    # This CI sandbox has a SOCKS proxy; the no-network SDK construction test
    # should not require an unrelated optional SOCKS transport dependency.
    monkeypatch.delenv('ALL_PROXY', raising=False)
    monkeypatch.delenv('all_proxy', raising=False)


def test_existing_env_names_load_without_app_prefix(tmp_path, monkeypatch):
    monkeypatch.delenv('FOUNDRY_PROJECT_ENDPOINT', raising=False)
    monkeypatch.delenv('FOUNDRY_MODEL_DEPLOYMENT_NAME', raising=False)
    path = tmp_path / '.env'
    path.write_text('FOUNDRY_PROJECT_ENDPOINT=https://example.services.ai.azure.com/api/projects/test\nFOUNDRY_MODEL_DEPLOYMENT_NAME=gpt-5.5\nAPP_SQL_SERVER=unchanged\n')
    configured = FoundrySettings(_env_file=path)
    assert configured.model_deployment_name == 'gpt-5.5'
    assert configured.auth_mode == 'azure_cli'


@pytest.mark.parametrize('endpoint', ['http://example.com/api/projects/test', 'https://example.com/',
    'https://example.com/api/projects/', r'https\://example.com/api/projects/test',
    'https://example.com/api/projects/test?key=secret', 'https://user:secret@example.com/api/projects/test'])
def test_invalid_endpoints_fail_before_client_creation(endpoint):
    with pytest.raises(ValidationError):
        FoundrySettings(_env_file=None, project_endpoint=endpoint, model_deployment_name='deployment')


def test_factory_creates_real_maf_agent_with_expected_name_and_closes_clients(monkeypatch):
    from azure.identity.aio import AzureCliCredential
    async def run():
        agent = create_agent(settings())
        assert isinstance(agent, Agent) and isinstance(agent.client, FoundryChatClient)
        assert agent.name == 'Enterprise_Architecture_Agent'
        assert isinstance(agent.client._credential, AzureCliCredential)
        # Installed SDK object construction exercises real constructor signatures.
        async with agent:
            pass
        assert agent.client.client.is_closed
    asyncio.run(run())


def test_managed_identity_is_selected_explicitly_and_resources_close():
    from azure.identity.aio import ManagedIdentityCredential
    async def run():
        async with create_agent(settings(auth_mode='managed_identity')) as agent:
            assert isinstance(agent.client._credential, ManagedIdentityCredential)
    asyncio.run(run())


def test_structured_input_labels_provenance_and_keeps_boolean_false():
    import json
    message = json.loads(preparation_input(context(), 'Which integrations should I clarify?'))
    assert message['project_context']['demand_id'] == '3845'
    assert message['project_context']['intake']['facts']['aiEffort'] is False
    assert 'not independently verified' in message['context_status']
    assert 'markdown' not in message


@pytest.mark.parametrize('question', ['', ' ', 'x' * 16001])
def test_empty_or_excessive_question_is_rejected(question):
    with pytest.raises(ValueError):
        preparation_input(context(), question)


def test_oversized_context_is_rejected_instead_of_silently_truncated():
    data = context().model_dump(by_alias=True)
    data['intake']['facts']['problemStatement'] = 'x' * 200001
    with pytest.raises(ValueError, match='too large'):
        preparation_input(EAProjectContext.model_validate(data), 'Explain')


class FakeAgent:
    def __init__(self, reply='Reply'):
        self.run = AsyncMock(return_value=SimpleNamespace(text=reply))
        self.closed = False
    async def __aenter__(self):
        return self
    async def __aexit__(self, *args):
        self.closed = True


def test_service_uses_fresh_agents_and_releases_resources(monkeypatch):
    from app.agents.enterprise_architecture import service
    agents = []
    def factory(_):
        agent = FakeAgent(); agents.append(agent); return agent
    monkeypatch.setattr(service, 'create_agent', factory)
    async def run():
        assert await ask(context(), 'Explain', settings()) == 'Reply'
        assert await ask(context(), 'Clarify', settings()) == 'Reply'
    asyncio.run(run())
    assert len(agents) == 2 and all(agent.closed for agent in agents)
    assert '3845' in agents[0].run.call_args.args[0]
    assert 'session' not in agents[0].run.call_args.kwargs


def test_empty_reply_is_not_reported_as_success(monkeypatch):
    from app.agents.enterprise_architecture import service
    agent = FakeAgent('   ')
    monkeypatch.setattr(service, 'create_agent', lambda _: agent)
    with pytest.raises(RuntimeError, match='no text'):
        asyncio.run(ask(context(), 'Explain', settings()))
    assert agent.closed


def test_timeout_still_closes_the_agent(monkeypatch):
    from app.agents.enterprise_architecture import service
    agent = FakeAgent()
    async def delayed(*args):
        await asyncio.sleep(1)
    agent.run = delayed
    monkeypatch.setattr(service, 'create_agent', lambda _: agent)
    with pytest.raises(TimeoutError):
        asyncio.run(ask(context(), 'Explain', settings(request_timeout_seconds=0.01)))
    assert agent.closed


def test_host_uses_request_factory_not_shared_mutable_agent(monkeypatch):
    from app.agents.enterprise_architecture import host
    created = []
    monkeypatch.setattr(host, 'ResponsesHostServer', lambda **kwargs: created.append(kwargs) or kwargs)
    build_server(settings())
    assert callable(created[0]['agent'])
    assert created[0]['history_source'] == 'agent_server'


def test_real_maf_execution_passes_instructions_and_structured_input_without_network(monkeypatch):
    from openai.types.responses import Response
    captured = []
    response = Response.model_validate({
        'id': 'resp-test', 'created_at': 0, 'object': 'response', 'model': 'deployment-name',
        'status': 'completed', 'parallel_tool_calls': False, 'tool_choice': 'auto', 'tools': [],
        'output': [{'id': 'msg-test', 'type': 'message', 'role': 'assistant', 'status': 'completed',
            'content': [{'type': 'output_text', 'text': 'Confirm the source systems and owners.', 'annotations': []}]}],
    })
    async def run():
        async with create_agent(settings()) as agent:
            async def respond(**kwargs):
                captured.append(kwargs)
                return SimpleNamespace(parse=lambda: response, headers={})
            monkeypatch.setattr(agent.client.client.responses.with_raw_response, 'create', respond)
            reply = await agent.run(preparation_input(context(), 'What should I ask?'))
            assert reply.text == 'Confirm the source systems and owners.'
    asyncio.run(run())
    request = captured[0]
    assert request['store'] is False
    assert request['max_output_tokens'] == 2000
    assert request['model'] == 'deployment-name'
    assert '3845' in str(request['input'])
    assert 'Do not assume Azure' in str(request)


@pytest.mark.parametrize('reason', ['length', 'content_filter', 'tool_calls'])
def test_partial_or_filtered_response_is_not_reported_as_success(reason, monkeypatch):
    from app.agents.enterprise_architecture import service
    agent = FakeAgent()
    agent.run = AsyncMock(return_value=SimpleNamespace(text='Partial text', finish_reason=reason))
    monkeypatch.setattr(service, 'create_agent', lambda _: agent)
    with pytest.raises(RuntimeError, match='incomplete or filtered'):
        asyncio.run(ask(context(), 'Explain', settings()))
    assert agent.closed


def test_hosted_platform_model_name_is_supported(monkeypatch):
    for key in ['FOUNDRY_MODEL_DEPLOYMENT_NAME', 'FOUNDRY_MODEL']:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('AZURE_AI_MODEL_DEPLOYMENT_NAME', 'hosted-deployment')
    configured = FoundrySettings(_env_file=None, project_endpoint='https://example.services.ai.azure.com/api/projects/test')
    assert configured.model_deployment_name == 'hosted-deployment'


def test_host_defaults_to_no_sensitive_content_in_telemetry(monkeypatch):
    import os
    from app.agents.enterprise_architecture import host
    monkeypatch.delenv('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', raising=False)
    monkeypatch.delenv('ENABLE_SENSITIVE_DATA', raising=False)
    monkeypatch.setattr(host, 'ResponsesHostServer', lambda **kwargs: kwargs)
    host.build_server(settings())
    assert os.environ['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] == 'false'
    assert os.environ['ENABLE_SENSITIVE_DATA'] == 'false'
