"""Add project reviewer assignments."""
revision = '20261025_reviewers'
down_revision = 'c89b1c5572b3'
branch_labels = None
depends_on = None

from alembic import op
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
