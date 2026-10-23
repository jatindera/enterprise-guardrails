- uv run uvicorn app.main:app --reload --port 8000 --log-level info --log-config logging.json
- uv run alembic init migrations
- uv run python -m app.db.check
- uv run python -m pytest -q
- uv run alembic revision --autogenerate -m "create projects and intake snapshots"
- uv run alembic upgrade head
- uv run alembic current
- uv run alembic check

```
$env:RUN_SQL_INTEGRATION = "1"

uv run python -m pytest tests/test_database.py -q

Remove-Item Env:RUN_SQL_INTEGRATION
```