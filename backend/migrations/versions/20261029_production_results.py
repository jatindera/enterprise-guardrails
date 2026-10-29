"""Persist production results and their gate approval audit snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = "20261029_production_results"
down_revision = "20261028_gate_artifacts"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("projects", sa.Column("production_status", sa.Unicode(20), nullable=False, server_default="Not deployed"))
    op.add_column("projects", sa.Column("go_live_date", sa.Date(), nullable=True))
    op.add_column("projects", sa.Column("production_comments", sa.Unicode(4000), nullable=False, server_default=""))
    op.add_column("projects", sa.Column("production_saved_at", DATETIMEOFFSET(), nullable=True))
    op.add_column("projects", sa.Column("production_saved_by", sa.Unicode(320), nullable=True))
    op.add_column("projects", sa.Column("production_revision", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.create_table("production_deployment_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("production_status", sa.Unicode(20), nullable=False),
        sa.Column("go_live_date", sa.Date(), nullable=True),
        sa.Column("comments", sa.Unicode(4000), nullable=False),
        sa.Column("actor_object_id", sa.Uuid(), nullable=False),
        sa.Column("actor_name", sa.Unicode(320), nullable=False),
        sa.Column("recorded_at", DATETIMEOFFSET(), nullable=False),
        sa.Column("gate_approval_snapshot", sa.UnicodeText(), nullable=False),
        sa.UniqueConstraint("project_id", "revision", name="uq_production_events_project_revision"),
        sa.CheckConstraint("production_status IN ('Not deployed', 'In production')", name=op.f("ck_production_deployment_events_status")))
    op.create_index("ix_production_deployment_events_project_id", "production_deployment_events", ["project_id"])

def downgrade():
    op.drop_table("production_deployment_events")
    with op.batch_alter_table("projects") as batch:
        for name in ("production_revision", "production_saved_by", "production_saved_at", "production_comments", "go_live_date", "production_status"):
            batch.drop_column(name, mssql_drop_default=name in {"production_revision", "production_comments", "production_status"})
