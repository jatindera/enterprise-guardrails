"""Explicit EA execution selection; errors never trigger a fallback."""
import asyncio
import os
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.agent import create_agent
from .hosted import invoke_hosted


class EAExecutionSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_EA_', extra='ignore')
    execution_mode: Literal['local', 'hosted'] = 'hosted'


async def _run_local(payload: str, settings: FoundrySettings) -> str:
    # Match the hosted entry point's privacy defaults without enabling content traces.
    os.environ.setdefault('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', 'false')
    os.environ.setdefault('ENABLE_SENSITIVE_DATA', 'false')
    async with create_agent(settings) as agent:
        response = await asyncio.wait_for(agent.run(payload), settings.request_timeout_seconds)
        text = response.text
        if not text or not text.strip() or len(text) > 40000:
            raise ValueError('Local EA response was empty or exceeded the output limit.')
        return text


def invoke_local(payload: str) -> str:
    # FastAPI's existing synchronous routes run in a worker thread.
    # Each request owns its event loop, agent, credential and HTTP clients.
    return asyncio.run(_run_local(payload, FoundrySettings()))


def invoke_ea(payload: str) -> str:
    if EAExecutionSettings().execution_mode == 'local':
        return invoke_local(payload)
    return invoke_hosted(payload)
