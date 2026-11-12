"""Route Security requests to their own agent in all execution modes."""
import asyncio
import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Literal

import httpx
from agent_framework.openai import OpenAIChatCompletionClient
from openai import AsyncOpenAI
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.agents.config import FoundrySettings
from app.agents.ollama import OllamaSettings
from app.agents.security.agent import create_agent, create_agent_with_client
from app.modules.ea_preparation.hosted import invoke_hosted_agent
from app.modules.ea_preparation.errors import EAInferenceError


_security_review_schema = ContextVar('security_review_schema', default=None)


@contextmanager
def structured_security_review(schema):
    token = _security_review_schema.set(schema)
    try:
        yield
    finally:
        _security_review_schema.reset(token)


class SecurityExecutionSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_SECURITY_', extra='ignore')
    execution_mode: Literal['local', 'hosted', 'ollama'] = 'hosted'


class HostedSecuritySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_SECURITY_', extra='ignore')
    agent_name: Literal['enterprise-security-agent'] = 'enterprise-security-agent'
    agent_version: str = Field(pattern=r'^[0-9]+$')


async def run(agent, payload, timeout):
    async with agent:
        response = await asyncio.wait_for(agent.run(payload), timeout)
    reason = getattr(response, 'finish_reason', None)
    reason = getattr(reason, 'value', reason)
    if reason in {'length', 'max_tokens', 'max_output_tokens'}:
        raise EAInferenceError('output_limit')
    if reason == 'content_filter':
        raise EAInferenceError('content_filter')
    if getattr(response, 'continuation_token', None) or not response.text or not response.text.strip():
        raise EAInferenceError('incomplete')
    if len(response.text) > 40000:
        raise EAInferenceError('output_too_large')
    return response.text


async def run_ollama(payload, settings):
    async with httpx.AsyncClient(trust_env=False) as transport:
        async with AsyncOpenAI(base_url=settings.base_url, api_key='ollama', http_client=transport,
                               max_retries=0, timeout=settings.request_timeout_seconds) as api:
            client = OpenAIChatCompletionClient(model=settings.model, async_client=api)
            schema = _security_review_schema.get()
            response_format = {'type': 'json_object'} if schema is None else {
                'type': 'json_schema',
                'json_schema': {'name': 'Security_Meeting_Review', 'schema': schema, 'strict': True},
            }
            agent = create_agent_with_client(client, {'max_tokens': settings.max_output_tokens,
                                                       'response_format': response_format})
            return await run(agent, payload, settings.request_timeout_seconds)


def invoke_security(payload: str) -> str:
    os.environ.setdefault('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', 'false')
    os.environ.setdefault('ENABLE_SENSITIVE_DATA', 'false')
    mode = SecurityExecutionSettings().execution_mode
    if mode == 'ollama':
        return asyncio.run(run_ollama(payload, OllamaSettings()))
    if mode == 'local':
        settings = FoundrySettings()
        return asyncio.run(run(create_agent(settings), payload, settings.request_timeout_seconds))
    return invoke_hosted_agent(payload, FoundrySettings(), HostedSecuritySettings())
