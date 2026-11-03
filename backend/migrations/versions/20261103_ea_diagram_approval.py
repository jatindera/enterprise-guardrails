"""Persist architecture diagram versions and human approval evidence."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision='20261103_ea_diagram_approval'
down_revision='20261102_ea_human_reviews'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('ea_architecture_diagrams',
        sa.Column('id',sa.Uuid(),primary_key=True),
        sa.Column('project_id',sa.Uuid(),sa.ForeignKey('projects.id'),nullable=False),
        sa.Column('file_name',sa.Unicode(260),nullable=False),
        sa.Column('description',sa.Unicode(4000),nullable=False),
        sa.Column('size_bytes',sa.Integer(),nullable=False),
        sa.Column('sha256',sa.Unicode(64),nullable=False),
        sa.Column('storage_account',sa.Unicode(24),nullable=False),
        sa.Column('container',sa.Unicode(63),nullable=False),
        sa.Column('blob_name',sa.Unicode(300),nullable=False),
        sa.Column('status',sa.Unicode(7),nullable=False),
        sa.Column('uploaded_by_object_id',sa.Unicode(128),nullable=False),
        sa.Column('uploaded_by_name',sa.Unicode(320),nullable=False),
        sa.Column('created_at',DATETIMEOFFSET(),nullable=False),
        sa.Column('uploaded_at',DATETIMEOFFSET(),nullable=True),
        sa.CheckConstraint("status IN ('Pending','Ready')",name='status'))
    op.create_index('ix_ea_architecture_diagrams_project_id','ea_architecture_diagrams',['project_id'])
    # Batch mode also supports the SQLite migration test double.
    with op.batch_alter_table('ea_human_reviews') as batch:
        batch.add_column(sa.Column('diagram_id',sa.Uuid(),nullable=True))
        batch.create_foreign_key('fk_ea_human_review_diagram','ea_architecture_diagrams',['diagram_id'],['id'])
        for key,typ,default in [
            ('diagram_file_name',sa.Unicode(260),''),
            ('diagram_confirmed',sa.Boolean(),'0'),
            ('diagram_requirement',sa.Unicode(20),'Required'),
            ('diagram_justification',sa.Unicode(2000),''),
            ('diagram_owner',sa.Unicode(320),'')]:
            batch.add_column(sa.Column(key,typ,nullable=False,server_default=default))
        batch.add_column(sa.Column('diagram_due_date',sa.Date(),nullable=True))

def downgrade():
    # Explicitly drop SQL Server default constraints before their columns.
    names=['diagram_file_name','diagram_confirmed','diagram_requirement','diagram_justification','diagram_owner']
    if op.get_bind().dialect.name=='mssql':
        for key in names:
            op.execute(sa.text("DECLARE @c sysname; SELECT @c=dc.name FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id WHERE dc.parent_object_id=OBJECT_ID(N'ea_human_reviews') AND c.name=N'"+key+"'; IF @c IS NOT NULL EXEC(N'ALTER TABLE ea_human_reviews DROP CONSTRAINT '+QUOTENAME(@c));"))
    with op.batch_alter_table('ea_human_reviews') as batch:
        batch.drop_constraint('fk_ea_human_review_diagram',type_='foreignkey')
        for key in ['diagram_id',*names,'diagram_due_date']:batch.drop_column(key)
    op.drop_table('ea_architecture_diagrams')
