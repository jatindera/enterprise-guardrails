from datetime import datetime, timezone, timedelta
from uuid import uuid4
import json
import pytest
from sqlalchemy import select, func, event
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.db.models import Project, ProductionDeploymentEvent
from test_project_api import client, database, payload
from test_gate import create, user, save as gate_save

URL='/api/projects/3601/production-deployment'
TODAY=datetime.now(timezone.utc).date().isoformat()

def approve(client):
    user(client,['Admin'])
    for domain in ['EA','Security','RAI']:
        assert gate_save(client,domain).status_code==200

def submit(client,status='In production',revision=0,comments='Deployment verified',day=TODAY):
    return client.put(URL,json={'productionStatus':status,'goLiveDate':day if status=='In production' else None,
        'comments':comments,'expectedRevision':revision})


def test_results_persist_after_new_get_and_portfolio_reflects_production(client,database):
    ids=create(client,database);approve(client);user(client,['enterprise-architect'],ids['EA'])
    response=submit(client);assert response.status_code==200,response.text
    result=response.json();assert result['productionStatus']=='In production'
    assert result['savedBy']=='Verified User' and result['savedAt'].endswith('Z')
    assert result['revision']==1
    assert client.get(URL).json()['productionStatus']=='In production'
    assert client.get('/api/projects').json()['items'][0]['productionStatus']=='In production'
    with Session(database) as session:
        row=session.scalar(select(ProductionDeploymentEvent))
        snapshot=json.loads(row.gate_approval_snapshot)
        assert len(snapshot)==3 and all(item['decision']=='Approved' for item in snapshot)

@pytest.mark.parametrize('domain,role',[('EA','enterprise-architect'),('Security','security-engineer'),('RAI','rai-manager')])
def test_all_assigned_primary_reviewers_can_submit(client,database,domain,role):
    ids=create(client,database);approve(client);user(client,[role],ids[domain])
    assert submit(client).status_code==200


def test_admin_can_submit_but_has_no_gate_override(client,database):
    create(client,database);user(client,['Admin'])
    assert submit(client).status_code==409
    approve(client)
    assert submit(client).status_code==200

@pytest.mark.parametrize('roles',[['general-users'],['enterprise-architect'],['arb-core-team'],['security-engineer'],['rai-manager']])
def test_unassigned_or_viewer_role_cannot_submit(client,database,roles):
    create(client,database);approve(client);user(client,roles)
    assert submit(client).status_code==403
    assert client.get(URL).json()['canSubmit'] is False


def test_additional_reviewer_is_read_only_for_submit(client,database):
    create(client,database);approve(client);oid=user(client,['enterprise-architect'])
    with Session(database) as session,session.begin():session.scalar(select(Project)).additional_ea_object_id=oid
    assert submit(client).status_code==403

@pytest.mark.parametrize('decision',['On hold','Rejected'])
def test_nonapproved_domain_blocks_production_with_reason(client,database,decision):
    create(client,database);approve(client)
    assert gate_save(client,'Security',decision,revision=1).status_code==200
    response=submit(client);assert response.status_code==409
    assert 'Security' in response.text and decision in response.text
    assert client.get(URL).json()['productionStatus']=='Not deployed'
    with Session(database) as session:assert session.scalar(select(func.count()).select_from(ProductionDeploymentEvent))==0


def test_no_gate_requirement_does_not_bypass_three_explicit_approvals(client,database):
    create(client,database,'No');user(client,['Admin'])
    response=submit(client);assert response.status_code==409
    assert 'does not bypass' in response.text


def test_reassigned_primary_requires_gate_reconfirmation(client,database):
    create(client,database);approve(client)
    with Session(database) as session,session.begin():session.scalar(select(Project)).assigned_rai_object_id=uuid4()
    result=submit(client);assert result.status_code==409
    assert 'RAI' in result.text and 'reconfirmation' in result.text


def test_current_decisions_are_rechecked_at_submit_not_only_on_get(client,database):
    create(client,database);approve(client)
    assert client.get(URL).json()['canMarkInProduction'] is True
    gate_save(client,'EA','Rejected',revision=1)
    assert submit(client).status_code==409


def test_reverting_to_not_deployed_retains_history_and_clears_date(client,database):
    create(client,database);approve(client)
    assert submit(client).status_code==200
    gate_save(client,'EA','On hold',revision=1)
    result=submit(client,'Not deployed',revision=1)
    assert result.status_code==200 and result.json()['goLiveDate'] is None
    assert len(result.json()['history'])==2


def test_stale_saves_fail_and_identical_retry_does_not_add_history(client,database):
    create(client,database);approve(client)
    assert submit(client).status_code==200
    assert submit(client,comments='Changed').status_code==409
    assert submit(client,revision=1).status_code==200
    assert len(client.get(URL).json()['history'])==1


def test_dates_and_extra_fields_are_validated(client,database):
    create(client,database);approve(client)
    body={'productionStatus':'In production','goLiveDate':None,'comments':'','expectedRevision':0}
    assert client.put(URL,json=body).status_code==422
    body['goLiveDate']=(datetime.now(timezone.utc).date()+timedelta(days=1)).isoformat()
    assert client.put(URL,json=body).status_code==422
    body.update(goLiveDate=TODAY,canMarkInProduction=True)
    assert client.put(URL,json=body).status_code==422


def test_commit_failure_does_not_persist_result_or_history(client,database):
    create(client,database);approve(client)
    def fail(session):
        if any(isinstance(row,ProductionDeploymentEvent) for row in session.identity_map.values()):
            raise SQLAlchemyError('Commit failure')
        # SQLAlchemy weak identity map may have released the newly flushed event.
        if any(isinstance(row,Project) and row.production_revision==1 for row in session.identity_map.values()):
            raise SQLAlchemyError('Commit failure')
    event.listen(Session,'before_commit',fail)
    try:
        assert submit(client).status_code==500
    finally:event.remove(Session,'before_commit',fail)
    with Session(database) as session:
        assert session.scalar(select(Project)).production_status=='Not deployed'
        assert session.scalar(select(func.count()).select_from(ProductionDeploymentEvent))==0


def test_reimport_preserves_saved_production_results(client,database):
    create(client,database);approve(client);submit(client)
    revision=client.get('/api/projects/3601').json()['revision']
    response=client.post('/api/projects/import',json=payload(expectedRevision=revision))
    assert response.status_code==200
    assert response.json()['productionStatus']=='In production'
    assert response.json()['productionRevision']==1


def test_production_migration_compiles_for_sql_server():
    from importlib.util import spec_from_file_location,module_from_spec
    from pathlib import Path
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[1]/'migrations/versions/20261029_production_results.py'
    spec=spec_from_file_location('production_migration',path);module=module_from_spec(spec);spec.loader.exec_module(module)
    assert module.down_revision=='20261028_gate_artifacts'
    output=StringIO()
    with Operations.context(MigrationContext.configure(dialect_name='mssql',dialect_opts={'deprecate_large_types':True},opts={'as_sql':True,'output_buffer':output})):
        module.upgrade()
    sql=output.getvalue()
    assert 'CREATE TABLE production_deployment_events' in sql
    assert 'production_status NVARCHAR(20)' in sql
    assert 'gate_approval_snapshot NVARCHAR(max)' in sql
    assert 'DATETIMEOFFSET' in sql
    assert 'DROP' not in sql


def test_production_migration_initializes_existing_projects_without_inventing_deployments():
    from importlib.util import spec_from_file_location,module_from_spec
    from pathlib import Path
    from sqlalchemy import create_engine,text,inspect
    from alembic.operations import Operations
    from alembic.migration import MigrationContext
    path=Path(__file__).parents[1]/'migrations/versions/20261029_production_results.py'
    spec=spec_from_file_location('production_migration_sqlite',path);module=module_from_spec(spec);spec.loader.exec_module(module)
    engine=create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE projects (id TEXT PRIMARY KEY)'))
        connection.execute(text("INSERT INTO projects VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        row=connection.execute(text('SELECT production_status, production_revision, go_live_date, production_saved_at FROM projects')).one()
        assert row==('Not deployed',0,None,None)
        assert 'production_deployment_events' in inspect(connection).get_table_names()
    engine.dispose()


@pytest.mark.parametrize('choices,combined',[
    (['Approved','Conditional approval','Approved'],'Conditional approval'),
    (['Approved','Approved','Not applicable'],'Approved'),
    (['Not applicable','Not applicable','Not applicable'],'Approved'),
    (['Conditional approval','Not applicable','Conditional approval'],'Conditional approval'),
])
def test_permitting_gate_outcomes_allow_go_live_and_preserve_original_decisions(client,database,choices,combined):
    create(client,database);user(client,['Admin'])
    for domain,choice in zip(['EA','Security','RAI'],choices):
        assert gate_save(client,domain,choice).status_code==200
    assert client.get('/api/projects/3601/pre-production-gate').json()['combinedStatus']==combined
    assert client.get(URL).json()['canMarkInProduction'] is True
    result=submit(client)
    assert result.status_code==200,result.text
    with Session(database) as session:
        snapshot=json.loads(session.scalar(select(ProductionDeploymentEvent)).gate_approval_snapshot)
        assert [row['decision'] for row in snapshot]==choices


def test_conditional_does_not_bypass_a_missing_or_reassigned_review(client,database):
    create(client,database);user(client,['Admin'])
    assert gate_save(client,'EA','Conditional approval').status_code==200
    assert submit(client).status_code==409
    assert gate_save(client,'Security','Not applicable').status_code==200
    assert gate_save(client,'RAI','Approved').status_code==200
    with Session(database) as session,session.begin():
        session.scalar(select(Project)).assigned_rai_object_id=uuid4()
    result=submit(client)
    assert result.status_code==409 and 'reconfirmation' in result.text
