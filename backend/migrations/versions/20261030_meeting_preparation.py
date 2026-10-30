"""Persist preparation questions and current/asked meeting progress."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = '20261030_meeting_preparation'
down_revision = '20261030_remove_raw_intake'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('meeting_preparations',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('project_id', sa.Uuid(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('domain', sa.Unicode(16), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('current_question_id', sa.Unicode(64), nullable=True),
        sa.Column('updated_at', DATETIMEOFFSET(), nullable=False),
        sa.Column('updated_by', sa.Unicode(128), nullable=False),
        sa.UniqueConstraint('project_id', 'domain'))
    op.create_table('meeting_prepared_questions',
        sa.Column('preparation_id', sa.Uuid(), sa.ForeignKey('meeting_preparations.id'), primary_key=True),
        sa.Column('id', sa.Unicode(64), primary_key=True),
        sa.Column('kind', sa.Unicode(16), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('question', sa.Unicode(4000), nullable=False),
        sa.Column('reason', sa.Unicode(2000), nullable=False),
        sa.Column('priority', sa.Unicode(16), nullable=False),
        sa.Column('source', sa.Unicode(16), nullable=False),
        sa.Column('selected', sa.Boolean(), nullable=False),
        sa.Column('asked_at', DATETIMEOFFSET(), nullable=True),
        sa.Column('asked_order', sa.Integer(), nullable=True))


def downgrade():
    op.drop_table('meeting_prepared_questions')
    op.drop_table('meeting_preparations')
