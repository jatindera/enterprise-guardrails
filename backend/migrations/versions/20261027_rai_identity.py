"""Add the primary RAI reviewer identity."""
from alembic import op
import sqlalchemy as sa
revision = "20261027_rai_identity"
down_revision = "20261027_security_identity"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("projects", sa.Column("assigned_rai_object_id", sa.Uuid(), nullable=True))
def downgrade():
    op.drop_column("projects", "assigned_rai_object_id")
