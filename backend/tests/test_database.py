import os
import struct

import pytest
from sqlalchemy import text

from app.db.models import Base
from app.db.session import get_engine, pack_sql_token


def test_sql_token_encoding():
    token = "sample-token-✓"
    packed = pack_sql_token(token)

    declared_length = struct.unpack("<I", packed[:4])[0]
    payload = packed[4:]

    assert declared_length == len(payload)
    assert payload.decode("utf-16-le") == token


@pytest.mark.skipif(
    os.getenv("RUN_SQL_INTEGRATION") != "1",
    reason="Requires Azure CLI login and configured Azure SQL.",
)
def test_sql_connection_and_expected_tables():
    engine = get_engine()

    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT 1")).scalar_one() == 1

            for table_name in Base.metadata.tables:
                exists = connection.execute(
                    text(
                        "SELECT COUNT(*) "
                        "FROM sys.tables t "
                        "JOIN sys.schemas s ON s.schema_id = t.schema_id "
                        "WHERE s.name = 'dbo' AND t.name = :table_name"
                    ),
                    {"table_name": table_name},
                ).scalar_one()

                assert exists == 1, f"Missing table: {table_name}"
    finally:
        engine.dispose()