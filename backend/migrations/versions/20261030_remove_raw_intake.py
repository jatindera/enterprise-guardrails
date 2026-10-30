"""Remove legacy whole-document Markdown after structured backfill.

This is an intentional data deletion. Back up the database before upgrading.
"""
from alembic import op
import sqlalchemy as sa

revision = '20261030_remove_raw_intake'
down_revision = '20261030_structured_intake'
branch_labels = None
depends_on = None


def upgrade():
    if op.get_context().as_sql:
        raise RuntimeError('Raw intake removal requires an online connection to verify structured backfill.')
    connection = op.get_bind()
    # Keep a legacy writer from inserting another unstructured snapshot between
    # verification and DROP COLUMN. Stop the API before running this migration.
    lock = ' WITH (TABLOCKX, HOLDLOCK)' if connection.dialect.name == 'mssql' else ''
    missing = connection.scalar(sa.text(f'''
        SELECT COUNT(*) FROM project_intake_snapshots AS snapshots{lock}
        LEFT JOIN project_intake_details AS details ON details.snapshot_id = snapshots.id
        WHERE details.snapshot_id IS NULL
    '''))
    if missing:
        raise RuntimeError(f'{missing} intake version(s) are not structured. Run '
            'python -m app.scripts.backfill_intake before retrying. Raw text has not been removed.')
    op.drop_column('project_intake_snapshots', 'markdown')


def downgrade():
    raise RuntimeError('Original Markdown cannot be reconstructed exactly. Restore the pre-upgrade '
        'database backup and matching application release to roll back this migration.')
