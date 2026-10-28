"""Keep verified display-name snapshots with votes and their history."""
from alembic import op
import sqlalchemy as sa

revision = "20261028_arb_voter_names"
down_revision = "20261028_arb_votes"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable for existing rows: historical display names cannot be reconstructed.
    op.add_column("arb_votes", sa.Column("voter_name", sa.Unicode(320), nullable=True))
    op.add_column("arb_vote_events", sa.Column("voter_name", sa.Unicode(320), nullable=True))


def downgrade():
    op.drop_column("arb_vote_events", "voter_name")
    op.drop_column("arb_votes", "voter_name")
