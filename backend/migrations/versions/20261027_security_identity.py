"""Bind Security reviewer identities to Entra object IDs."""
from alembic import op
import sqlalchemy as sa

revision = "20261027_security_identity"
down_revision = "20261027_ea_identity"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("projects", sa.Column("assigned_security_object_id", sa.Uuid(), nullable=True))
    op.add_column("projects", sa.Column("additional_security_email", sa.Unicode(320), nullable=True))
    op.add_column("projects", sa.Column("additional_security_object_id", sa.Uuid(), nullable=True))

def downgrade():
    op.drop_column("projects", "additional_security_object_id")
    op.drop_column("projects", "additional_security_email")
    op.drop_column("projects", "assigned_security_object_id")
