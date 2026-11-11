"""Create the Security review version history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET

revision = "20261109_security_reviews"
down_revision = "20261103_ea_diagram_approval"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "security_review_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Unicode(20), nullable=False),
        sa.Column("source_revision", sa.Integer(), nullable=True),
        sa.Column("payload", sa.UnicodeText(), nullable=False),
        sa.Column("author_id", sa.Unicode(128), nullable=False),
        sa.Column("created_at", DATETIMEOFFSET(), nullable=False),
        sa.UniqueConstraint("project_id", "revision"),
    )


def downgrade():
    op.drop_table("security_review_versions")
