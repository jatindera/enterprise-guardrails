"""Check migration defaults on populated tables using a disposable SQLite database."""
import runpy
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_existing_rows_get_defaults_and_downgrade():
    script = Path(__file__).parents[1] / "scripts/create_reviewer_migration.py"
    body = runpy.run_path(str(script))["BODY"]
    namespace = {}
    exec(body, namespace)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE projects (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO projects (id) VALUES (1)"))
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            namespace["upgrade"]()
            row = connection.execute(text("SELECT assigned_security, assigned_rai FROM projects WHERE id=1")).one()
            assert tuple(row) == ("Not assigned", "Chris Cawthon")
            namespace["downgrade"]()
            assert connection.execute(text("SELECT id FROM projects")).scalar_one() == 1
    engine.dispose()


def test_generator_links_existing_head_and_refuses_duplicate(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    script = Path(__file__).parents[1] / "scripts/create_reviewer_migration.py"
    config_path = tmp_path / "alembic.ini"
    config = Config()
    config.config_file_name = str(config_path)
    command.init(config, str(tmp_path / "migrations"))
    command.revision(Config(str(config_path)), message="initial", rev_id="initial_head")
    monkeypatch.chdir(tmp_path)
    namespace = runpy.run_path(str(script))
    namespace["main"]()
    generated = next((tmp_path / "migrations/versions").glob("20261025_reviewers_*.py"))
    revision = runpy.run_path(str(generated))
    assert revision["down_revision"] == "initial_head"
    assert revision["revision"] == "20261025_reviewers"
    import pytest
    with pytest.raises(SystemExit, match="already exists"):
        namespace["main"]()
