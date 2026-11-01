"""Explicit, loopback-only Ollama development provider; never falls back to Azure."""
import asyncio
import os
from contextlib import contextmanager
from contextvars import ContextVar
from urllib.parse import urlsplit
import httpx
from openai import AsyncOpenAI
from agent_framework.openai import OpenAIChatCompletionClient
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.agents.enterprise_architecture.agent import create_agent_with_client
from app.modules.ea_preparation.errors import EAInferenceError


# Request-scoped: ordinary chats/questions do not inherit the review schema.
_review_schema = ContextVar('ollama_review_schema', default=None)


@contextmanager
def structured_review_output():
    from app.modules.ea_meeting_reviews.schemas import ReferencedReview
    schema = ReferencedReview.model_json_schema()
    token = _review_schema.set(schema)
    try:
        yield
    finally:
        _review_schema.reset(token)


class OllamaSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_OLLAMA_', extra='ignore')
    model: str = Field(min_length=1, max_length=180)
    base_url: str = 'http://localhost:11434/v1'
    max_output_tokens: int = Field(default=4000, ge=256, le=16000)
    request_timeout_seconds: int = Field(default=120, ge=1, le=240)

    @field_validator('base_url')
    @classmethod
    def local_only(cls, value):
        parsed = urlsplit(value)
        if (parsed.scheme != 'http' or parsed.hostname not in ['localhost', '127.0.0.1', '::1']
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path.rstrip('/') != '/v1'):
            raise ValueError('Use a loopback Ollama URL ending in /v1.')
        return value.rstrip('/')

    @field_validator('model')
    @classmethod
    def local_model(cls, value):
        value = value.strip()
        if not value or any(c.isspace() for c in value) or 'cloud' in value.lower():
            raise ValueError('Use the exact name of a locally downloaded model, not a cloud model.')
        return value


async def _run_ollama(payload: str, settings: OllamaSettings) -> str:
    os.environ.setdefault('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', 'false')
    os.environ.setdefault('ENABLE_SENSITIVE_DATA', 'false')
    # Ignore proxy environment variables. All model traffic stays on loopback.
    async with httpx.AsyncClient(trust_env=False) as transport:
        async with AsyncOpenAI(base_url=settings.base_url, api_key='ollama',
            http_client=transport, max_retries=0, timeout=settings.request_timeout_seconds) as api:
            client = OpenAIChatCompletionClient(model=settings.model, async_client=api)
            async with create_agent_with_client(client, settings.max_output_tokens) as agent:
                schema = _review_schema.get()
                options = {} if schema is None else {
                    'response_format': {'type': 'json_schema', 'json_schema': {
                        'name': 'EA_Meeting_Review', 'schema': schema, 'strict': True}},
                    'temperature': 0,
                }
                response = await asyncio.wait_for(agent.run(payload, options=options), settings.request_timeout_seconds)
                reason = getattr(response, 'finish_reason', None)
                reason = getattr(reason, 'value', reason)
                if reason in ['length', 'max_tokens', 'max_output_tokens']:
                    raise EAInferenceError('output_limit')
                if reason == 'content_filter': raise EAInferenceError('content_filter')
                if getattr(response, 'continuation_token', None): raise EAInferenceError('incomplete')
                text = response.text
                if not text or not text.strip() or len(text) > 40000:
                    raise EAInferenceError('empty_output' if not text or not text.strip() else 'output_too_large')
                return text


def invoke_ollama(payload: str) -> str:
    return asyncio.run(_run_ollama(payload, OllamaSettings()))
