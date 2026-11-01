"""Audit reopening of the single EA review workspace."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET

revision = '20261101_ea_review_reopen'
down_revision = '20261031_ea_meeting_reviews'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('ea_review_reopen_events',
        sa.Column('id',sa.Uuid(),primary_key=True),
        sa.Column('meeting_id',sa.Uuid(),sa.ForeignKey('ea_review_meetings.id'),nullable=False),
        sa.Column('accepted_review_id',sa.Uuid(),sa.ForeignKey('ea_meeting_reviews.id'),nullable=False),
        sa.Column('draft_review_id',sa.Uuid(),sa.ForeignKey('ea_meeting_reviews.id'),nullable=False),
        sa.Column('reason',sa.Unicode(1000),nullable=False),
        sa.Column('created_by',sa.Unicode(128),nullable=False),
        sa.Column('created_by_name',sa.Unicode(200),nullable=False),
        sa.Column('created_at',DATETIMEOFFSET(),nullable=False))
    op.create_index('ix_ea_review_reopen_events_meeting_id','ea_review_reopen_events',['meeting_id'])


def downgrade():
    op.drop_table('ea_review_reopen_events')
