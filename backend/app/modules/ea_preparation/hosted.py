"""One request-scoped hosted session; no model or local-demo fallback."""
import logging
from contextlib import ExitStack
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import VersionRefIndicator
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from app.agents.config import FoundrySettings

logger = logging.getLogger(__name__)


class HostedEASettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_EA_', extra='ignore')
    agent_name: str = Field(default='enterprise-architecture-agent', pattern=r'^[a-z0-9][a-z0-9-]{0,62}$')
    agent_version: str = Field(pattern=r'^[0-9]+$')


def invoke_hosted(payload: str) -> str:
    settings = FoundrySettings()
    hosted = HostedEASettings()
    with ExitStack() as stack:
        credential = stack.enter_context(AzureCliCredential() if settings.auth_mode == 'azure_cli'
            else ManagedIdentityCredential(client_id=settings.managed_identity_client_id))
        project = stack.enter_context(AIProjectClient(endpoint=settings.project_endpoint,
            credential=credential, allow_preview=True, retry_total=0,
            connection_timeout=15, read_timeout=settings.request_timeout_seconds))
        session = project.agents.create_session(agent_name=hosted.agent_name,
            version_indicator=VersionRefIndicator(agent_version=hosted.agent_version))
        try:
            with project.get_openai_client(agent_name=hosted.agent_name,
                    timeout=settings.request_timeout_seconds, max_retries=0) as client:
                response = client.responses.create(input=payload, store=False, stream=False,
                    extra_body={'agent_session_id': session.agent_session_id})
            if response.status != 'completed' or not response.output_text or not response.output_text.strip():
                raise ValueError('Hosted response was incomplete or empty.')
            if len(response.output_text) > 40000:
                raise ValueError('Hosted response exceeded the output limit.')
            return response.output_text
        finally:
            try:
                project.agents.stop_session(agent_name=hosted.agent_name, session_id=session.agent_session_id)
            except Exception as exc:
                # No payloads, session IDs, credentials or service response bodies in logs.
                logger.warning('EA session cleanup failed; exception_type=%s', type(exc).__name__)
