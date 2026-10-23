import struct
from collections.abc import Generator
from functools import lru_cache

import pyodbc
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from sqlalchemy import URL, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.config import Settings


SQL_SCOPE = "https://database.windows.net/.default"
SQL_COPT_SS_ACCESS_TOKEN = 1256

# SQLAlchemy manages connections. Disable the driver's separate pool.
pyodbc.pooling = False


def pack_sql_token(token: str) -> bytes:
    token_bytes = token.encode("utf-16-le")
    return struct.pack("<I", len(token_bytes)) + token_bytes


def build_engine(settings: Settings) -> Engine:
    if not settings.sql_server or not settings.sql_database:
        raise ValueError(
            "APP_SQL_SERVER and APP_SQL_DATABASE must be configured."
        )

    if settings.sql_auth_mode == "azure_cli":
        credential = AzureCliCredential()
    else:
        credential = ManagedIdentityCredential(
            client_id=settings.sql_managed_identity_client_id
        )

    url = URL.create(
        "mssql+pyodbc",
        host=settings.sql_server,
        port=1433,
        database=settings.sql_database,
        query={
            "driver": settings.sql_odbc_driver,
            "Encrypt": "yes",
            "TrustServerCertificate": "no",
        },
    )

    engine_options = {
        "echo": False,
        "hide_parameters": True,
        "connect_args": {"timeout": 30},
    }

    if settings.sql_auth_mode == "azure_cli":
        # Close local connections after use to help serverless auto-pause.
        engine_options["poolclass"] = NullPool
    else:
        engine_options.update(
            pool_size=2,
            max_overflow=1,
            pool_pre_ping=True,
            pool_recycle=1800,
        )

    engine = create_engine(url, **engine_options)

    @event.listens_for(engine, "do_connect")
    def provide_access_token(
        dialect,
        connection_record,
        connection_args,
        connection_params,
    ):
        # SQLAlchemy may add this when no username/password is supplied.
        connection_args[0] = connection_args[0].replace(
            ";Trusted_Connection=Yes", ""
        )

        token = credential.get_token(SQL_SCOPE).token

        connection_params["attrs_before"] = {
            SQL_COPT_SS_ACCESS_TOKEN: pack_sql_token(token)
        }

    return engine


@lru_cache
def get_engine() -> Engine:
    return build_engine(Settings())


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine(), autoflush=False) as session:
        yield session