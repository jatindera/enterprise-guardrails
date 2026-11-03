"""Persist separate human EA drafts, submissions and append-only snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET

revision='20261102_ea_human_reviews'
down_revision='20261101_ea_review_proposal'
branch_labels=None
depends_on=None


def upgrade():
    op.add_column('projects',sa.Column('ea_status',sa.Unicode(32),nullable=False,server_default='Pending'))
    op.add_column('projects',sa.Column('ea_complexity',sa.Unicode(16),nullable=False,server_default='Not assessed'))
    op.create_table('ea_human_reviews',
        sa.Column('id',sa.Uuid(),primary_key=True),
        sa.Column('project_id',sa.Uuid(),sa.ForeignKey('projects.id'),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),
        sa.Column('revision',sa.Integer(),nullable=False),
        sa.Column('status',sa.Unicode(16),nullable=False),
        sa.Column('source_review_id',sa.Uuid(),sa.ForeignKey('ea_meeting_reviews.id'),nullable=False),
        sa.Column('source_input_digest',sa.Unicode(64),nullable=False),
        sa.Column('source_text_sha256',sa.Unicode(64),nullable=False),
        sa.Column('parent_review_id',sa.Uuid(),sa.ForeignKey('ea_human_reviews.id'),nullable=True),
        sa.Column('review_text',sa.UnicodeText(),nullable=False),
        sa.Column('technology_stack',sa.Unicode(2000),nullable=False),
        sa.Column('technology_rationale',sa.Unicode(4000),nullable=False),
        sa.Column('complexity',sa.Unicode(16),nullable=True),
        sa.Column('decision',sa.Unicode(32),nullable=True),
        sa.Column('decision_rationale',sa.Unicode(4000),nullable=False),
        sa.Column('conditions',sa.Unicode(4000),nullable=False),
        sa.Column('created_at',DATETIMEOFFSET(),nullable=False),
        sa.Column('updated_at',DATETIMEOFFSET(),nullable=False),
        sa.Column('created_by',sa.Unicode(128),nullable=False),
        sa.Column('created_by_name',sa.Unicode(200),nullable=False),
        sa.Column('updated_by',sa.Unicode(128),nullable=False),
        sa.Column('updated_by_name',sa.Unicode(200),nullable=False),
        sa.Column('submitted_at',DATETIMEOFFSET(),nullable=True),
        sa.Column('submitted_by',sa.Unicode(128),nullable=True),
        sa.Column('submitted_by_name',sa.Unicode(200),nullable=True),
        sa.UniqueConstraint('project_id','version'),
        sa.CheckConstraint("status IN ('Draft','Submitted','Superseded')",name='human_review_status'))
    op.create_index('ix_ea_human_reviews_project_id','ea_human_reviews',['project_id'])
    op.create_table('ea_human_review_events',
        sa.Column('id',sa.Uuid(),primary_key=True),
        sa.Column('project_id',sa.Uuid(),sa.ForeignKey('projects.id'),nullable=False),
        sa.Column('review_id',sa.Uuid(),sa.ForeignKey('ea_human_reviews.id'),nullable=False),
        sa.Column('action',sa.Unicode(16),nullable=False),
        sa.Column('review_revision',sa.Integer(),nullable=False),
        sa.Column('intent_hash',sa.Unicode(64),nullable=False),
        sa.Column('payload',sa.UnicodeText(),nullable=False),
        sa.Column('reason',sa.Unicode(1000),nullable=True),
        sa.Column('created_by',sa.Unicode(128),nullable=False),
        sa.Column('created_by_name',sa.Unicode(200),nullable=False),
        sa.Column('created_at',DATETIMEOFFSET(),nullable=False))
    op.create_index('ix_ea_human_review_events_project_id','ea_human_review_events',['project_id'])
    op.create_index('ix_ea_human_review_events_review_id','ea_human_review_events',['review_id'])


def downgrade():
    op.drop_table('ea_human_review_events')
    op.drop_table('ea_human_reviews')
    # SQL Server requires dropping named DEFAULT constraints before the columns.
    for field in ('ea_complexity','ea_status'):
        if op.get_bind().dialect.name=='mssql':
            op.execute(sa.text("DECLARE @constraint sysname; SELECT @constraint=dc.name FROM sys.default_constraints dc "
                "JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id "
                "WHERE dc.parent_object_id=OBJECT_ID(N'projects') AND c.name=N'"+field+"'; "
                "IF @constraint IS NOT NULL EXEC(N'ALTER TABLE projects DROP CONSTRAINT '+QUOTENAME(@constraint));"))
        op.drop_column('projects',field)
