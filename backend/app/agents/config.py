"""Foundry settings are separate from APP_* API/database configuration."""
from typing import Literal
from urllib.parse import urlsplit
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FoundrySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8',
        env_prefix='FOUNDRY_', extra='ignore', frozen=True, populate_by_name=True)

    project_endpoint: str
    model_deployment_name: str = Field(validation_alias=AliasChoices(
        'FOUNDRY_MODEL_DEPLOYMENT_NAME', 'FOUNDRY_MODEL', 'AZURE_AI_MODEL_DEPLOYMENT_NAME', 'MODEL_DEPLOYMENT_NAME'))
    auth_mode: Literal['azure_cli', 'managed_identity'] = Field(default='azure_cli',
        validation_alias=AliasChoices('EG_AGENT_AUTH_MODE', 'FOUNDRY_AUTH_MODE'))
    managed_identity_client_id: str | None = None
    request_timeout_seconds: float = Field(default=90, gt=0, le=300)
    max_output_tokens: int = Field(default=2000, ge=256, le=16000)

    @field_validator('project_endpoint')
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        value = value.strip().rstrip('/')
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or '\\' in value or any(character.isspace() for character in value)
            or not parsed.path.startswith('/api/projects/')
            or len(parsed.path.removeprefix('/api/projects/').split('/')) != 1
            or not parsed.path.removeprefix('/api/projects/')):
            raise ValueError('Use a plain HTTPS Foundry project endpoint, without backslashes, query, or credentials.')
        return value

    @field_validator('model_deployment_name')
    @classmethod
    def validate_deployment(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 128 or any(character.isspace() for character in value) or '\\' in value:
            raise ValueError('Set the exact deployed model name, not a model URL or an empty value.')
        return value
