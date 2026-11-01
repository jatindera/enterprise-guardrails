"""Persist the proposed EA review stack independently from final EA decisions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision='20261101_ea_review_proposal'
down_revision='20261101_ea_review_reopen'
branch_labels=None
depends_on=None

def upgrade():
    for column in [
        sa.Column('proposed_technologies',sa.UnicodeText(),nullable=True),
        sa.Column('proposal_rationale',sa.Unicode(4000),nullable=True),
        sa.Column('proposal_updated_at',DATETIMEOFFSET(),nullable=True),
        sa.Column('proposal_updated_by',sa.Unicode(128),nullable=True),
        sa.Column('proposal_updated_by_name',sa.Unicode(200),nullable=True)]:
        op.add_column('ea_review_meetings',column)

def downgrade():
    for name in ['proposal_updated_by_name','proposal_updated_by','proposal_updated_at','proposal_rationale','proposed_technologies']:
        op.drop_column('ea_review_meetings',name)
