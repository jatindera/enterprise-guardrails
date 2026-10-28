"""Shared gate attachments, with traceable upload reservations."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = "20261028_gate_artifacts"
down_revision = "20261028_gate_decisions"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("gate_artifacts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("file_name", sa.Unicode(260), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.Unicode(64), nullable=False),
        sa.Column("storage_account", sa.Unicode(24), nullable=False),
        sa.Column("container", sa.Unicode(63), nullable=False),
        sa.Column("blob_name", sa.Unicode(300), nullable=False),
        sa.Column("status", sa.Unicode(7), nullable=False),
        sa.Column("uploaded_by_object_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_name", sa.Unicode(320), nullable=False),
        sa.Column("created_at", DATETIMEOFFSET(), nullable=False),
        sa.Column("uploaded_at", DATETIMEOFFSET(), nullable=True),
        sa.CheckConstraint("status IN ('Pending', 'Ready')", name=op.f("ck_gate_artifacts_status")))
    op.create_index("ix_gate_artifacts_project_id", "gate_artifacts", ["project_id"])

def downgrade():
    op.drop_table("gate_artifacts")
