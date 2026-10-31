"""Persistent EA meetings, Blob transcript metadata and versioned reviews."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = '20261031_ea_meeting_reviews'
down_revision = '20261030_meeting_preparation'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('ea_review_meetings',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('project_id', sa.Uuid(), sa.ForeignKey('projects.id'), nullable=False, primary_key=False),
        sa.Column('number', sa.Integer(), nullable=False, primary_key=False),
        sa.Column('title', sa.Unicode(length=200), nullable=False, primary_key=False),
        sa.Column('state', sa.Unicode(length=16), nullable=False, primary_key=False),
        sa.Column('revision', sa.Integer(), nullable=False, primary_key=False),
        sa.Column('created_at', DATETIMEOFFSET(), nullable=False, primary_key=False),
        sa.Column('created_by', sa.Unicode(length=128), nullable=False, primary_key=False),
        sa.Column('updated_at', DATETIMEOFFSET(), nullable=False, primary_key=False),
        sa.UniqueConstraint('project_id','number'),
    )
    op.create_index('ix_ea_review_meetings_project_id', 'ea_review_meetings', ['project_id'])
    op.create_table('ea_meeting_transcripts',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('meeting_id', sa.Uuid(), sa.ForeignKey('ea_review_meetings.id'), nullable=False, primary_key=False),
        sa.Column('file_name', sa.Unicode(length=260), nullable=False, primary_key=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False, primary_key=False),
        sa.Column('sha256', sa.Unicode(length=64), nullable=False, primary_key=False),
        sa.Column('storage_account', sa.Unicode(length=24), nullable=False, primary_key=False),
        sa.Column('container', sa.Unicode(length=63), nullable=False, primary_key=False),
        sa.Column('blob_name', sa.Unicode(length=512), nullable=False, primary_key=False),
        sa.Column('status', sa.Unicode(length=16), nullable=False, primary_key=False),
        sa.Column('uploaded_at', DATETIMEOFFSET(), nullable=False, primary_key=False),
        sa.Column('uploaded_by', sa.Unicode(length=128), nullable=False, primary_key=False),
    )
    op.create_index('ix_ea_meeting_transcripts_meeting_id', 'ea_meeting_transcripts', ['meeting_id'])
    op.create_table('ea_meeting_reviews',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('meeting_id', sa.Uuid(), sa.ForeignKey('ea_review_meetings.id'), nullable=False, primary_key=False),
        sa.Column('version', sa.Integer(), nullable=False, primary_key=False),
        sa.Column('status', sa.Unicode(length=16), nullable=False, primary_key=False),
        sa.Column('basis_review_id', sa.Uuid(), sa.ForeignKey('ea_meeting_reviews.id'), nullable=True, primary_key=False),
        sa.Column('parent_review_id', sa.Uuid(), sa.ForeignKey('ea_meeting_reviews.id'), nullable=True, primary_key=False),
        sa.Column('input_digest', sa.Unicode(length=64), nullable=False, primary_key=False),
        sa.Column('input_manifest', sa.UnicodeText(), nullable=False, primary_key=False),
        sa.Column('ai_result', sa.UnicodeText(), nullable=True, primary_key=False),
        sa.Column('review_text', sa.UnicodeText(), nullable=True, primary_key=False),
        sa.Column('profile_version', sa.Unicode(length=32), nullable=False, primary_key=False),
        sa.Column('execution_mode', sa.Unicode(length=16), nullable=False, primary_key=False),
        sa.Column('agent_reference', sa.Unicode(length=200), nullable=False, primary_key=False),
        sa.Column('created_at', DATETIMEOFFSET(), nullable=False, primary_key=False),
        sa.Column('created_by', sa.Unicode(length=128), nullable=False, primary_key=False),
        sa.Column('accepted_at', DATETIMEOFFSET(), nullable=True, primary_key=False),
        sa.Column('accepted_by', sa.Unicode(length=128), nullable=True, primary_key=False),
        sa.Column('accepted_by_name', sa.Unicode(length=200), nullable=True, primary_key=False),
        sa.UniqueConstraint('meeting_id','version'),
    )
    op.create_index('ix_ea_meeting_reviews_meeting_id', 'ea_meeting_reviews', ['meeting_id'])

def downgrade():
    op.drop_table('ea_meeting_reviews')
    op.drop_table('ea_meeting_transcripts')
    op.drop_table('ea_review_meetings')
