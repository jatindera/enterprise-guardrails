"""Generate (do not apply) the reviewer migration, linked to this repo's head.

Run from backend: uv run python scripts/create_reviewer_migration.py
"""
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

REVISION_ID = "20261025_reviewers"
BODY = '''from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("projects", sa.Column(
        "assigned_security", sa.Unicode(320), nullable=False, server_default="Not assigned",
    ))
    op.add_column("projects", sa.Column(
        "assigned_rai", sa.Unicode(320), nullable=False, server_default="Chris Cawthon",
    ))


def downgrade() -> None:
    # SQL Server must drop its default constraint before dropping each column.
    op.drop_column("projects", "assigned_rai", mssql_drop_default=True)
    op.drop_column("projects", "assigned_security", mssql_drop_default=True)
'''


def main() -> None:
    if not Path("alembic.ini").is_file():
        raise SystemExit("Run this command from the backend directory containing alembic.ini.")
    config = Config("alembic.ini")
    scripts = ScriptDirectory.from_config(config)
    heads = scripts.get_heads()
    if len(heads) != 1:
        raise SystemExit("Expected exactly one existing migration head. Resolve migration branches first.")
    if any(revision.revision == REVISION_ID for revision in scripts.walk_revisions()):
        raise SystemExit("Reviewer migration already exists; inspect it and run alembic upgrade head if needed.")
    parent = heads[0]
    revision = command.revision(config, message="add project reviewer assignments", rev_id=REVISION_ID, head=parent)
    if isinstance(revision, list) or revision is None:
        raise SystemExit("Unexpected migration generation result; inspect migrations before proceeding.")
    text = (
        '"""Add project reviewer assignments."""\n'
        f'revision = {REVISION_ID!r}\n'
        f'down_revision = {parent!r}\n'
        'branch_labels = None\ndepends_on = None\n\n' + BODY
    )
    Path(revision.path).write_text(text, encoding="utf-8")
    print(f"Created {revision.path}")
    print("Review the migration, then run: uv run alembic upgrade head")


if __name__ == "__main__":
    main()
