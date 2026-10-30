from pathlib import Path
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, func, event
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.db.models import Project, ProjectIntakeSnapshot, ProjectIntakeDetail, ProjectIntakeField, ProjectIntakeStakeholder
from app.modules.intake.parser import parse_intake
from app.scripts.backfill_intake import backfill
from test_project_api import client, database, payload

SAMPLE=(Path(__file__).parent/'fixtures/structured_intake.md').read_text()
URL='/api/projects/3601/intake-context'


@pytest.fixture(autouse=True)
def directory_stub(client):
    from uuid import uuid5, NAMESPACE_DNS
    from app.modules.projects.ea_assignment_router import graph_resolver
    from app.modules.projects.graph_identity import DirectoryUser
    client.app.dependency_overrides[graph_resolver] = lambda: (lambda upn: DirectoryUser(uuid5(NAMESPACE_DNS, upn.casefold()), upn))


def test_sample_round_trip_stores_facts_people_and_section_fields(client,database):
    imported=client.post('/api/projects/import',json=payload(markdown=SAMPLE)).json()
    context=client.get(URL).json()
    assert imported['intakeContext']==context
    assert context['facts']['problemStatement'].startswith('DuPont currently lacks')
    assert context['facts']['desiredBusinessOutcome'].startswith('Utilizing the Agent 365 SDK')
    assert context['facts']['valueDescription'].startswith('Implementing the Agent 365 SDK')
    assert context['facts']['businessFunction']=='IT'
    assert context['facts']['aiEffort'] is True
    assert context['facts']['capitalProject'] is False
    assert Decimal(context['facts']['budgetAmountUsd'])==0
    assert Decimal(context['facts']['priorityScore'])==80
    assert context['facts']['expectedUserCount']==50
    assert context['facts']['targetProjectStart']=='4Q2026'
    assert context['facts']['dataClassification']=='Confidential'
    assert context['facts']['regulatoryData']=='PII'
    assert context['parsingWarnings']==[]
    by_role={person['role']:person for person in context['stakeholders']}
    assert by_role['Sponsor']['email']=='amy.sunderhauf@dupont.com'
    assert by_role['Requestor']['email']=='christopher.cawthon@dupont.com'
    assert by_role['IT business partner']['email']=='carla.romero@dupont.com'
    assert by_role['Assigned architect (intake)']['email']=='testuser-ea@raspbians.com'
    assert len({entry['section'] for entry in context['comments']})==3
    with Session(database) as session:
        details=session.scalar(select(ProjectIntakeDetail))
        assert details.problem_statement==context['facts']['problemStatement']
        assert session.scalar(select(func.count()).select_from(ProjectIntakeField))==len(context['sourceFields'])
        assert session.scalar(select(func.count()).select_from(ProjectIntakeStakeholder))==8


def test_repeated_comments_and_unknown_fields_are_not_lost(client):
    md='''## Security Assessment
| Comments | Security comment |
## Architecture Assessment
| Comments | Architecture comment |
| Future field | A new value |
### Desired Business Outcome
First paragraph.

Second paragraph: including https://example.com.
'''
    assert client.post('/api/projects/import',json=payload(markdown=md)).status_code==201
    context=client.get(URL).json()
    assert [entry['value'] for entry in context['comments']]==['Security comment','Architecture comment']
    assert any(entry['fieldName']=='Future field' and entry['value']=='A new value' for entry in context['sourceFields'])
    assert context['facts']['desiredBusinessOutcome']=='First paragraph.\n\nSecond paragraph: including https://example.com.'


def test_bad_typed_values_warn_but_original_values_remain():
    parsed=parse_intake('| Expected number of users impacted | Many users |\n| Priority Score | 120% |\n| Capital Project | Maybe |')
    assert parsed.facts['expected_user_count'] is None
    assert parsed.facts['priority_score'] is None
    assert parsed.facts['capital_project'] is None
    assert len(parsed.warnings)==3
    assert [entry['value'] for entry in parsed.fields]==['Many users','120%','Maybe']


def test_multiple_conflicting_scalar_values_are_not_guessed():
    parsed=parse_intake('| Data Classification | Confidential |\n| Data Classification | Public |')
    assert parsed.facts['data_classification'] is None
    assert parsed.warnings
    assert len(parsed.fields)==2


def test_bullets_names_emails_and_multiline_outcomes():
    md='''## Opportunity Intake
- **GLT Sponsor:** Jane Example <jane@example.com>
- **LOB/Function Requestor:** [Requestor](mailto:requestor@example.com)
- **Budgeted Amount USD:** $1,000.50
- **This project is classified as an AI Effort:** Yes
- **Expected number of users impacted:** 500
#### Desired Business Outcome
Reduce research effort.
Provide better reports.
'''
    parsed=parse_intake(md)
    assert parsed.facts['budget_amount_usd']==Decimal('1000.50')
    assert parsed.facts['expected_user_count']==500
    assert parsed.facts['desired_business_outcome']=='Reduce research effort.\nProvide better reports.'
    sponsor=next(p for p in parsed.stakeholders if p['role']=='Sponsor')
    assert sponsor['display_name']=='Jane Example' and sponsor['email']=='jane@example.com'


def test_reimport_creates_structured_history_and_absent_values_do_not_leak(client):
    first=client.post('/api/projects/import',json=payload(markdown=SAMPLE)).json()
    first_id=first['intakeContext']['version']['snapshotId']
    changed=client.post('/api/projects/import',json=payload(markdown='### Problem Statement\nA new problem.',expectedRevision=first['revision']))
    assert changed.status_code==200
    latest=client.get(URL).json()
    assert latest['facts']['problemStatement']=='A new problem.'
    assert latest['facts']['desiredBusinessOutcome'] is None
    assert latest['stakeholders']==[]
    old=client.get(URL,params={'snapshotId':first_id}).json()
    assert old['facts']['desiredBusinessOutcome'].startswith('Utilizing the Agent 365 SDK')
    versions=client.get('/api/projects/3601/intake-versions').json()
    assert len(versions)==2 and all(version['structured'] for version in versions)


def test_versions_cannot_be_read_through_another_project(client):
    saved=client.post('/api/projects/import',json=payload(markdown=SAMPLE)).json()
    client.post('/api/projects/import',json=payload(demand_id='3602',name='Other'))
    wrong=client.get('/api/projects/3602/intake-context',params={'snapshotId':saved['intakeContext']['version']['snapshotId']})
    assert wrong.status_code==404


def test_backfill_is_idempotent_and_does_not_change_project_or_markdown(client,database):
    client.post('/api/projects/import',json=payload())
    with Session(database) as session,session.begin():
        project=session.scalar(select(Project))
        project_id=project.id;project_revision=project.revision
        snapshot=ProjectIntakeSnapshot(project_id=project_id,source_file_name='legacy.md')
        session.add(snapshot);session.flush();snapshot_id=snapshot.id
    add_legacy_markdown(database, snapshot_id)
    assert client.get(URL).status_code==409
    result=backfill(database)
    assert result=={'completed':1,'failed':[]}
    assert backfill(database)=={'completed':0,'failed':[]}
    with Session(database) as session:
        assert session.get(Project,project_id).revision==project_revision
        assert legacy_markdown(database, snapshot_id)==SAMPLE
        assert session.get(ProjectIntakeDetail,snapshot_id).data_classification=='Confidential'


def test_context_is_read_from_columns_not_reparsed_on_every_read(client,database):
    imported=client.post('/api/projects/import',json=payload(markdown=SAMPLE)).json()
    snapshot_id=imported['intakeContext']['version']['snapshotId']
    with Session(database) as session,session.begin():
        # Updating metadata does not change the structured facts.
        session.get(ProjectIntakeSnapshot, UUID(snapshot_id)).source_file_name='Renamed source'
    assert client.get(URL).json()['facts']['dataClassification']=='Confidential'


def test_import_failure_rolls_back_every_structured_table(client,database):
    def fail(session,context,instances):
        if any(isinstance(row,ProjectIntakeField) for row in session.new):
            raise SQLAlchemyError('Simulated structured write failure')
    event.listen(Session,'before_flush',fail)
    try:
        assert client.post('/api/projects/import',json=payload(markdown=SAMPLE)).status_code==500
    finally:event.remove(Session,'before_flush',fail)
    with Session(database) as session:
        for model in [Project,ProjectIntakeSnapshot,ProjectIntakeDetail,ProjectIntakeField,ProjectIntakeStakeholder]:
            assert session.scalar(select(func.count()).select_from(model))==0


def test_structured_migration_initializes_schema_without_deleting_original_intake():
    from importlib.util import module_from_spec,spec_from_file_location
    from sqlalchemy import create_engine,text,inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[1]/'migrations/versions/20261030_structured_intake.py'
    spec=spec_from_file_location('structured_intake_migration',path);module=module_from_spec(spec);spec.loader.exec_module(module)
    assert module.down_revision=='20261029_production_results'
    engine=create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE project_intake_snapshots (id TEXT PRIMARY KEY, markdown TEXT)'))
        conn.execute(text("INSERT INTO project_intake_snapshots VALUES ('legacy', 'Original intake content')"))
        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()
        assert conn.execute(text('SELECT markdown, source_system FROM project_intake_snapshots')).one()==('Original intake content','markdown')
        for table in ['project_intake_details','project_intake_fields','project_intake_stakeholders']:
            assert table in inspect(conn).get_table_names()
    engine.dispose()


def test_models_cover_every_typed_intake_field_and_migration_compiles_for_sql_server():
    from app.modules.intake.fields import DETAIL_FIELDS
    from importlib.util import module_from_spec,spec_from_file_location
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    assert set(DETAIL_FIELDS) <= set(ProjectIntakeDetail.__table__.columns.keys())
    path=Path(__file__).parents[1]/'migrations/versions/20261030_structured_intake.py'
    spec=spec_from_file_location('structured_intake_sqlserver',path);module=module_from_spec(spec);spec.loader.exec_module(module)
    output=StringIO()
    with Operations.context(MigrationContext.configure(dialect_name='mssql',opts={'as_sql':True,'output_buffer':output})):
        module.upgrade()
    sql=output.getvalue()
    assert 'CREATE TABLE project_intake_details' in sql and 'source_modified_at DATETIMEOFFSET' in sql
    assert 'priority_score NUMERIC(5, 2)' in sql
    assert 'DROP' not in sql and 'DELETE' not in sql


def test_structured_api_is_readable_by_general_users_but_import_remains_admin_only(client):
    from app.core.auth import current_user
    client.post('/api/projects/import',json=payload(markdown=SAMPLE))
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(uuid4()),'roles':['general-users']}
    assert client.get(URL).status_code==200
    assert client.post('/api/projects/import',json=payload(demand_id='3602',name='Forbidden')).status_code==403


def test_backfill_failure_keeps_snapshot_retryable_and_reports_no_completion(client,database):
    client.post('/api/projects/import',json=payload())
    with Session(database) as session,session.begin():
        project=session.scalar(select(Project))
        row=ProjectIntakeSnapshot(project_id=project.id,source_file_name='retry.md')
        session.add(row);session.flush();snapshot_id=row.id
    add_legacy_markdown(database, snapshot_id)
    def fail(session,context,instances):
        if any(isinstance(row,ProjectIntakeField) for row in session.new):
            raise SQLAlchemyError('Failure')
    event.listen(Session,'before_flush',fail)
    try:
        report=backfill(database)
    finally:event.remove(Session,'before_flush',fail)
    assert report['completed']==0 and len(report['failed'])==1
    with Session(database) as session:
        assert session.get(ProjectIntakeDetail,snapshot_id) is None
        assert legacy_markdown(database, snapshot_id)==SAMPLE
    assert backfill(database)=={'completed':1,'failed':[]}


def test_structured_writer_accepts_a_future_sharepoint_adapter_without_markdown(client,database):
    from datetime import datetime,timezone
    from app.modules.intake.parser import ParsedIntake
    from app.modules.intake.service import store_context
    client.post('/api/projects/import',json=payload())
    with Session(database) as session,session.begin():
        project=session.scalar(select(Project))
        snapshot=ProjectIntakeSnapshot(project_id=project.id,source_file_name='SharePoint item 42',
            source_system='sharepoint',source_item_id='site/list/42',source_url='https://example.sharepoint.com/lists/intake/42',
            source_modified_at=datetime(2026,10,30,tzinfo=timezone.utc),source_etag='"42,1"')
        session.add(snapshot);session.flush()
        store_context(session,snapshot,ParsedIntake(facts={'problem_statement':'Structured source data','ai_effort':True},
            stakeholders=[{'role':'Sponsor','display_name':'Sponsor','email':'sponsor@example.com','source_value':'Sponsor <sponsor@example.com>'}]))
    context=client.get(URL).json()
    assert context['facts']['problemStatement']=='Structured source data'
    assert context['version']['sourceSystem']=='sharepoint'
    assert context['version']['sourceItemId']=='site/list/42'
    assert context['version']['sourceModifiedAt'].endswith('Z')
    assert context['stakeholders'][0]['email']=='sponsor@example.com'


def add_legacy_markdown(engine, snapshot_id):
    from sqlalchemy import text
    with engine.begin() as connection:
        connection.execute(text('ALTER TABLE project_intake_snapshots ADD COLUMN markdown TEXT'))
        connection.execute(text('UPDATE project_intake_snapshots SET markdown=:value WHERE id=:id'),
            {'value': SAMPLE, 'id': snapshot_id.hex})


def legacy_markdown(engine, snapshot_id):
    from sqlalchemy import text
    with engine.connect() as connection:
        return connection.scalar(text('SELECT markdown FROM project_intake_snapshots WHERE id=:id'), {'id': snapshot_id.hex})
