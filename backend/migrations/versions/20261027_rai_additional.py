"""Additional RAI reviewer identity."""
from alembic import op
import sqlalchemy as sa
revision = "20261027_rai_additional"
down_revision = "20261027_rai_identity"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("projects", sa.Column("additional_rai_email", sa.Unicode(320), nullable=True))
    op.add_column("projects", sa.Column("additional_rai_object_id", sa.Uuid(), nullable=True))
def downgrade():
    op.drop_column("projects", "additional_rai_object_id")
    op.drop_column("projects", "additional_rai_email")
