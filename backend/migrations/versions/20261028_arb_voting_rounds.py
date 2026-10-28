"""Preserve existing ballots as round one and introduce Admin-controlled closure."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql

revision = "20261028_arb_voting_rounds"
down_revision = "20261028_arb_voter_names"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "arb_voting_rounds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("status", sa.Unicode(6), nullable=False),
        sa.Column("opened_at", mssql.DATETIMEOFFSET(), nullable=False),
        sa.Column("opened_by_object_id", sa.Uuid(), nullable=True),
        sa.Column("opened_by_name", sa.Unicode(320), nullable=True),
        sa.Column("reopen_reason", sa.Unicode(2000), nullable=True),
        sa.Column("closed_at", mssql.DATETIMEOFFSET(), nullable=True),
        sa.Column("closed_by_object_id", sa.Uuid(), nullable=True),
        sa.Column("closed_by_name", sa.Unicode(320), nullable=True),
        sa.Column("outcome", sa.Unicode(30), nullable=True),
        sa.Column("closed_in_favour", sa.Integer(), nullable=True),
        sa.Column("closed_against", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_arb_voting_rounds")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name=op.f("fk_arb_voting_rounds_project_id_projects")),
        sa.UniqueConstraint("project_id", "number", name="uq_arb_voting_rounds_project_number"),
        sa.CheckConstraint("status IN ('Open', 'Closed')", name=op.f("ck_arb_voting_rounds_status")),
        sa.CheckConstraint("number >= 1", name=op.f("ck_arb_voting_rounds_number")),
        sa.CheckConstraint("number = 1 OR (reopen_reason IS NOT NULL AND LTRIM(RTRIM(reopen_reason)) <> '')",
                           name=op.f("ck_arb_voting_rounds_reopen_reason")),
    )
    # SQL Server set-based backfill: all old votes and vote history are retained.
    op.execute("""
        INSERT INTO arb_voting_rounds (id, project_id, number, status, opened_at)
        SELECT NEWID(), id, 1, 'Open', SYSUTCDATETIME() FROM projects
    """)
    op.add_column("arb_votes", sa.Column("round_number", sa.Integer(), nullable=False, server_default="1"))
    op.drop_constraint("uq_arb_votes_project_voter", "arb_votes", type_="unique")
    op.create_unique_constraint("uq_arb_votes_round_voter", "arb_votes", ["project_id", "round_number", "voter_object_id"])
    op.create_foreign_key("fk_arb_votes_round", "arb_votes", "arb_voting_rounds",
                          ["project_id", "round_number"], ["project_id", "number"])


def downgrade():
    # Combining votes from several rounds would violate the old uniqueness rule.
    # Refuse destructive data loss; use a tested backup if later rounds exist.
    op.execute("""
        IF EXISTS (SELECT 1 FROM arb_voting_rounds WHERE number > 1)
            THROW 50001, 'Cannot downgrade while multiple ARB voting rounds exist.', 1
    """)
    op.drop_constraint("fk_arb_votes_round", "arb_votes", type_="foreignkey")
    op.drop_constraint("uq_arb_votes_round_voter", "arb_votes", type_="unique")
    op.create_unique_constraint("uq_arb_votes_project_voter", "arb_votes", ["project_id", "voter_object_id"])
    op.drop_column("arb_votes", "round_number", mssql_drop_default=True)
    op.drop_table("arb_voting_rounds")
