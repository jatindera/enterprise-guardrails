"""Prepare EA identity bindings. Existing assignments require later resolution."""
from alembic import op
import sqlalchemy as sa

revision = "20261027_ea_identity"
down_revision = "20261025_reviewers"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("projects", sa.Column("assigned_ea_object_id", sa.Uuid(), nullable=True))
    op.add_column("projects", sa.Column("additional_ea_email", sa.Unicode(320), nullable=True))
    op.add_column("projects", sa.Column("additional_ea_object_id", sa.Uuid(), nullable=True))

def downgrade() -> None:
    op.drop_column("projects", "additional_ea_object_id")
    op.drop_column("projects", "additional_ea_email")
    op.drop_column("projects", "assigned_ea_object_id")
