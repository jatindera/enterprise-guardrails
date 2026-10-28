from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_arb_migration_compiles_for_azure_sql():
    path = Path(__file__).parents[1] / 'migrations/versions/20261028_arb_votes.py'
    spec = spec_from_file_location('arb_votes_migration', path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == '20261027_rai_additional'
    output = StringIO()
    context = MigrationContext.configure(dialect_name='mssql', opts={'as_sql': True, 'output_buffer': output})
    with Operations.context(context):
        module.upgrade()
    sql = output.getvalue()
    assert 'CREATE TABLE arb_votes' in sql
    assert 'CREATE TABLE arb_vote_events' in sql
    assert 'DATETIMEOFFSET' in sql
    assert 'uq_arb_votes_project_voter' in sql
    assert 'DROP' not in sql


def test_name_migration_is_additive_and_keeps_old_votes():
    path = Path(__file__).parents[1] / 'migrations/versions/20261028_arb_voter_names.py'
    spec = spec_from_file_location('arb_voter_names_migration', path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == '20261028_arb_votes'
    output = StringIO()
    context = MigrationContext.configure(dialect_name='mssql', opts={'as_sql': True, 'output_buffer': output})
    with Operations.context(context):
        module.upgrade()
    sql = output.getvalue()
    assert 'ALTER TABLE arb_votes ADD voter_name NVARCHAR(320) NULL' in sql
    assert 'ALTER TABLE arb_vote_events ADD voter_name NVARCHAR(320) NULL' in sql
    assert 'DELETE' not in sql and 'DROP' not in sql and 'UPDATE' not in sql
