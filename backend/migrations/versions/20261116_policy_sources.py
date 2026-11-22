"""Persist policy citations on prepared questions."""
from alembic import op
import sqlalchemy as sa

revision = "20261116_policy_sources"
down_revision = "20261109_security_reviews"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("meeting_prepared_questions", sa.Column("policy_sources", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("meeting_prepared_questions", "policy_sources")
