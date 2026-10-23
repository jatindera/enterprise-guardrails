from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="APP_",
        extra="ignore",
    )

    name: str = "Enterprise Guardrails API"
    environment: Literal["local", "test", "dev", "prod"] = "local"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    sql_server: str = ""
    sql_database: str = ""
    sql_auth_mode: Literal["azure_cli", "managed_identity"] = "azure_cli"
    sql_odbc_driver: str = "ODBC Driver 18 for SQL Server"

    # Optional: set only when using a user-assigned managed identity.
    sql_managed_identity_client_id: str | None = None