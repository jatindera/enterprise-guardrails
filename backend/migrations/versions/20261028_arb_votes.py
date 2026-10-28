"""Persist current ARB votes and their revision history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql

revision = "20261028_arb_votes"
down_revision = "20261027_rai_additional"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "arb_votes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("voter_object_id", sa.Uuid(), nullable=False),
        sa.Column("choice", sa.Unicode(7), nullable=False),
        sa.Column("reason", sa.Unicode(2000), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("recorded_at", mssql.DATETIMEOFFSET(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_arb_votes")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name=op.f("fk_arb_votes_project_id_projects")),
        sa.UniqueConstraint("project_id", "voter_object_id", name="uq_arb_votes_project_voter"),
        sa.CheckConstraint("choice IN ('For', 'Against')", name=op.f("ck_arb_votes_choice")),
        sa.CheckConstraint("choice <> 'Against' OR (reason IS NOT NULL AND LTRIM(RTRIM(reason)) <> '')",
                           name=op.f("ck_arb_votes_reason")),
    )
    op.create_table(
        "arb_vote_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vote_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("choice", sa.Unicode(7), nullable=False),
        sa.Column("reason", sa.Unicode(2000), nullable=True),
        sa.Column("recorded_at", mssql.DATETIMEOFFSET(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_arb_vote_events")),
        sa.ForeignKeyConstraint(["vote_id"], ["arb_votes.id"], name=op.f("fk_arb_vote_events_vote_id_arb_votes")),
        sa.UniqueConstraint("vote_id", "revision", name="uq_arb_vote_events_vote_revision"),
    )


def downgrade():
    op.drop_table("arb_vote_events")
    op.drop_table("arb_votes")
