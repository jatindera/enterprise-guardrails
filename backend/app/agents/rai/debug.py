"""Explicitly enabled RAI prompt inspection in the existing console logger."""
import json
import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("guardrails.api")


class RAIDebugSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_RAI_", extra="ignore")
    log_prompts: bool = False


def log_prompt_event(event: str, **fields) -> None:
    if RAIDebugSettings().log_prompts:
        logger.info(json.dumps({"event": event, **fields}, ensure_ascii=False))
