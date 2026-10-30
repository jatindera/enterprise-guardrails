"""Structured, versioned intake facts and stakeholders; retain raw audit source."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = "20261030_structured_intake"
down_revision = "20261029_production_results"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("project_intake_snapshots", sa.Column("source_system", sa.Unicode(32), nullable=False, server_default="markdown"))
    op.add_column("project_intake_snapshots", sa.Column("source_item_id", sa.Unicode(512), nullable=True))
    op.add_column("project_intake_snapshots", sa.Column("source_url", sa.UnicodeText(), nullable=True))
    op.add_column("project_intake_snapshots", sa.Column("source_modified_at", DATETIMEOFFSET(), nullable=True))
    op.add_column("project_intake_snapshots", sa.Column("source_etag", sa.Unicode(512), nullable=True))
    op.create_table("project_intake_details",
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("project_intake_snapshots.id"), primary_key=True),
        sa.Column("parser_version", sa.Unicode(16), nullable=False),
        sa.Column("parsing_warnings", sa.UnicodeText(), nullable=False),
        sa.Column("title", sa.UnicodeText(), nullable=True),
        sa.Column("business_function", sa.UnicodeText(), nullable=True),
        sa.Column("program", sa.UnicodeText(), nullable=True),
        sa.Column("program_kpis", sa.UnicodeText(), nullable=True),
        sa.Column("requesting_organization", sa.UnicodeText(), nullable=True),
        sa.Column("site_location", sa.UnicodeText(), nullable=True),
        sa.Column("target_project_start", sa.UnicodeText(), nullable=True),
        sa.Column("target_project_go_live", sa.UnicodeText(), nullable=True),
        sa.Column("problem_statement", sa.UnicodeText(), nullable=True),
        sa.Column("value_description", sa.UnicodeText(), nullable=True),
        sa.Column("desired_business_outcome", sa.UnicodeText(), nullable=True),
        sa.Column("value_savings_type", sa.UnicodeText(), nullable=True),
        sa.Column("intake_priority_driver", sa.UnicodeText(), nullable=True),
        sa.Column("business_priority", sa.UnicodeText(), nullable=True),
        sa.Column("supported_company_goals", sa.UnicodeText(), nullable=True),
        sa.Column("ai_initiative", sa.UnicodeText(), nullable=True),
        sa.Column("level_of_effort", sa.UnicodeText(), nullable=True),
        sa.Column("priority_level", sa.UnicodeText(), nullable=True),
        sa.Column("request_type", sa.UnicodeText(), nullable=True),
        sa.Column("request_subtype", sa.UnicodeText(), nullable=True),
        sa.Column("product_solution_name", sa.UnicodeText(), nullable=True),
        sa.Column("vendor_name", sa.UnicodeText(), nullable=True),
        sa.Column("integrated_systems", sa.UnicodeText(), nullable=True),
        sa.Column("data_classification", sa.UnicodeText(), nullable=True),
        sa.Column("regulatory_data", sa.UnicodeText(), nullable=True),
        sa.Column("deployment_type", sa.UnicodeText(), nullable=True),
        sa.Column("impacted_users", sa.UnicodeText(), nullable=True),
        sa.Column("primary_delivery_team", sa.UnicodeText(), nullable=True),
        sa.Column("engaged_delivery_teams", sa.UnicodeText(), nullable=True),
        sa.Column("review_meeting_date", sa.UnicodeText(), nullable=True),
        sa.Column("architecture_assessment_status", sa.UnicodeText(), nullable=True),
        sa.Column("architecture_assessment_link", sa.UnicodeText(), nullable=True),
        sa.Column("architecture_assessment_complete_date", sa.UnicodeText(), nullable=True),
        sa.Column("security_risk_rating", sa.UnicodeText(), nullable=True),
        sa.Column("security_assessment_status", sa.UnicodeText(), nullable=True),
        sa.Column("security_assessment_link", sa.UnicodeText(), nullable=True),
        sa.Column("security_assessment_complete_date", sa.UnicodeText(), nullable=True),
        sa.Column("ai_effort", sa.Boolean(), nullable=True),
        sa.Column("capital_project", sa.Boolean(), nullable=True),
        sa.Column("architecture_change", sa.Boolean(), nullable=True),
        sa.Column("consulting_services", sa.Boolean(), nullable=True),
        sa.Column("integration_needed", sa.Boolean(), nullable=True),
        sa.Column("data_classification_change", sa.Boolean(), nullable=True),
        sa.Column("create_project_tracker", sa.Boolean(), nullable=True),
        sa.Column("architecture_assessment_required", sa.Boolean(), nullable=True),
        sa.Column("arb_required", sa.Boolean(), nullable=True),
        sa.Column("security_assessment_required", sa.Boolean(), nullable=True),
        sa.Column("pre_production_gate_required", sa.Boolean(), nullable=True),
        sa.Column("budget_amount_usd", sa.Numeric(19, 2), nullable=True),
        sa.Column("priority_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("expected_user_count", sa.BigInteger(), nullable=True),
    )
    op.create_table("project_intake_fields",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("project_intake_snapshots.id"), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("section", sa.UnicodeText(), nullable=False),
        sa.Column("field_name", sa.UnicodeText(), nullable=False),
        sa.Column("value", sa.UnicodeText(), nullable=False),
        sa.Column("kind", sa.Unicode(16), nullable=False),
        sa.UniqueConstraint("snapshot_id", "ordinal", name="uq_intake_fields_snapshot_ordinal"))
    op.create_index("ix_project_intake_fields_snapshot_id", "project_intake_fields", ["snapshot_id"])
    op.create_table("project_intake_stakeholders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("project_intake_snapshots.id"), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("role", sa.Unicode(64), nullable=False),
        sa.Column("display_name", sa.UnicodeText(), nullable=True),
        sa.Column("email", sa.Unicode(320), nullable=True),
        sa.Column("source_value", sa.UnicodeText(), nullable=False))
    op.create_index("ix_project_intake_stakeholders_snapshot_id", "project_intake_stakeholders", ["snapshot_id"])

def downgrade():
    op.drop_table("project_intake_stakeholders")
    op.drop_table("project_intake_fields")
    op.drop_table("project_intake_details")
    with op.batch_alter_table("project_intake_snapshots") as batch:
        for name in ("source_etag", "source_modified_at", "source_url", "source_item_id", "source_system"):
            batch.drop_column(name, mssql_drop_default=name == "source_system")
