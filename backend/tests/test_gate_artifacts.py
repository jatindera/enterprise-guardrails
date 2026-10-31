from uuid import uuid4
import hashlib
import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from azure.core.exceptions import ServiceRequestError
from app.db.models import GateArtifact, Project
from app.modules.artifacts.storage import artifact_store
from test_project_api import client, database, payload
from test_gate import create, user

BASE = '/api/projects/3601/pre-production-gate/attachments'
class Store:
    account = 'egstorageadlshn'
    container = 'project-artifacts'
    def __init__(self):
        self.blobs = {}
        self.fail = False
        self.calls = 0
    def validate(self): pass
    def put(self, container, name, data, digest):
        self.calls += 1
        if self.fail: raise ServiceRequestError('Unavailable')
        self.blobs[(container, name)] = data
    def delete(self, container, name):
        if getattr(self, "delete_fail", False): raise ServiceRequestError("Unavailable")
        self.blobs.pop((container, name), None)
    def get(self, container, name, size, digest):
        data = self.blobs[(container, name)]
        assert len(data) == size and hashlib.sha256(data).hexdigest() == digest
        return data

@pytest.fixture
def store(client):
    store = Store()
    client.app.dependency_overrides[artifact_store] = lambda: store
    return store

def upload(client, uid=None, name='evidence.pdf', data=b'%PDF-example'):
    return client.put(BASE + '/' + str(uid or uuid4()), params={'fileName': name}, content=data,
        headers={'content-type': 'application/octet-stream'})


def test_upload_is_shared_and_persists_metadata_and_download(client, database, store):
    ids = create(client, database)
    user(client, ['enterprise-architect'], ids['EA'])
    result = upload(client)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['uploadedByName'] == 'Verified User'
    assert saved['uploadedAt'].endswith('Z')
    assert len(store.blobs) == 1
    assert next(iter(store.blobs))[1].startswith('3601/pre-production/')
    user(client, ['general-users'])
    assert client.get(BASE).json()['items'] == [saved]
    response = client.get(BASE + '/' + saved['id'] + '/download')
    assert response.status_code == 200 and response.content == b'%PDF-example'
    assert response.headers['content-type'] == 'application/octet-stream'
    assert "filename*=UTF-8''evidence.pdf" in response.headers['content-disposition']
    assert response.headers['cache-control'] == 'no-store'
    with Session(database) as session:
        record = session.scalar(select(GateArtifact))
        assert record.status == 'Ready' and record.storage_account == 'egstorageadlshn'

@pytest.mark.parametrize('domain,role', [('Security','security-engineer'),('RAI','rai-manager')])
def test_other_primary_reviewers_can_upload(client,database,store,domain,role):
    ids = create(client,database)
    user(client,[role],ids[domain])
    assert upload(client).status_code == 200


def test_general_and_additional_cannot_upload(client,database,store):
    create(client,database)
    oid = user(client,['enterprise-architect'])
    with Session(database) as session, session.begin(): session.scalar(select(Project)).additional_ea_object_id = oid
    assert upload(client).status_code == 403
    user(client,['general-users'])
    assert upload(client).status_code == 403
    assert store.calls == 0


def test_admin_can_upload_but_exempt_gate_blocks_everyone(client,database,store):
    create(client,database,'No')
    user(client,['Admin'])
    assert upload(client).status_code == 409
    assert store.calls == 0


def test_failed_upload_is_pending_and_retry_is_idempotent(client,database,store):
    create(client,database)
    user(client,['Admin'])
    uid = uuid4()
    store.fail = True
    assert upload(client,uid).status_code == 503
    assert client.get(BASE).json()['items'] == []
    with Session(database) as session:
        assert session.get(GateArtifact,uid).status == 'Pending'
    store.fail = False
    result = upload(client,uid)
    assert result.status_code == 200
    calls = store.calls
    assert upload(client,uid).json() == result.json()
    assert store.calls == calls
    with Session(database) as session:
        assert session.scalar(select(func.count()).select_from(GateArtifact)) == 1


def test_same_identifier_cannot_replace_content_or_be_claimed_by_someone_else(client,database,store):
    create(client,database)
    user(client,['Admin'])
    uid = uuid4()
    assert upload(client,uid).status_code == 200
    assert upload(client,uid,data=b'different').status_code == 409
    user(client,['Admin'])
    assert upload(client,uid).status_code == 409
    assert len(store.blobs) == 1

@pytest.mark.parametrize('name', ['../proof.pdf','folder/proof.pdf','folder\\proof.pdf','proof.exe','bad\r\n.pdf'])
def test_invalid_filenames_are_rejected(client,database,store,name):
    create(client,database)
    user(client,['Admin'])
    assert upload(client,name=name).status_code == 422
    assert store.calls == 0


def test_empty_and_large_uploads_are_rejected(client,database,store):
    create(client,database)
    user(client,['Admin'])
    assert upload(client,data=b'').status_code == 422
    assert upload(client,data=b'x'*(20*1024*1024+1)).status_code == 413
    assert store.calls == 0


def test_attachment_identifier_does_not_allow_cross_project_download(client,database,store):
    create(client,database)
    user(client,['Admin'])
    saved = upload(client).json()
    assert client.post('/api/projects/import',json=payload(demand_id='3602',name='Other')).status_code == 201
    other = '/api/projects/3602/pre-production-gate/attachments/' + saved['id'] + '/download'
    assert client.get(other).status_code == 404


def test_download_survives_gate_becoming_not_required(client,database,store):
    create(client,database)
    user(client,['Admin'])
    saved = upload(client).json()
    with Session(database) as session, session.begin(): session.scalar(select(Project)).gate_required = False
    assert client.get(BASE + '/' + saved['id'] + '/download').status_code == 200
    assert upload(client).status_code == 409


def test_schema_migration_compiles_for_sql_server():
    from importlib.util import spec_from_file_location,module_from_spec
    from pathlib import Path
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[1]/'migrations/versions/20261028_gate_artifacts.py'
    spec=spec_from_file_location('artifacts_migration',path);module=module_from_spec(spec);spec.loader.exec_module(module)
    out=StringIO()
    with Operations.context(MigrationContext.configure(dialect_name='mssql',opts={'as_sql':True,'output_buffer':out})):
        module.upgrade()
    sql=out.getvalue()
    assert 'CREATE TABLE gate_artifacts' in sql and 'DATETIMEOFFSET' in sql
    assert 'DROP' not in sql


def test_storage_success_sql_confirmation_failure_is_retryable(client,database,store):
    from sqlalchemy import event
    from sqlalchemy.exc import SQLAlchemyError
    create(client,database);user(client,['Admin']);uid=uuid4()
    def fail_confirmation(session,context,instances):
        if any(isinstance(row,GateArtifact) and row.status=='Ready' for row in session.dirty):
            raise SQLAlchemyError('Simulated confirmation failure')
    event.listen(Session,'before_flush',fail_confirmation)
    try:
        assert upload(client,uid).status_code==503
    finally:
        event.remove(Session,'before_flush',fail_confirmation)
    with Session(database) as session: assert session.get(GateArtifact,uid).status=='Pending'
    assert len(store.blobs)==1
    assert client.get(BASE).json()['items']==[]
    assert upload(client,uid).status_code==200
    assert len(client.get(BASE).json()['items'])==1


def test_disabling_gate_during_upload_prevents_it_being_published(client,database,store):
    ids=create(client,database);user(client,['enterprise-architect'],ids['EA'])
    original=store.put
    def put_and_disable(*args):
        original(*args)
        with Session(database) as session,session.begin(): session.scalar(select(Project)).gate_required=False
    store.put=put_and_disable
    assert upload(client).status_code==409
    assert client.get(BASE).json()['items']==[]
    with Session(database) as session: assert session.scalar(select(GateArtifact)).status=='Pending'


def test_blob_client_uses_selected_identity_and_recovers_existing_upload(monkeypatch):
    from unittest.mock import MagicMock
    from azure.core.exceptions import ResourceExistsError
    from app.modules.artifacts import storage
    from app.core.config import Settings
    cli=MagicMock();mi=MagicMock();factory=MagicMock()
    monkeypatch.setattr(storage,'AzureCliCredential',cli)
    monkeypatch.setattr(storage,'ManagedIdentityCredential',mi)
    monkeypatch.setattr(storage,'BlobServiceClient',factory)
    blob=factory.return_value.__enter__.return_value.get_blob_client.return_value
    blob.upload_blob.side_effect=ResourceExistsError('Exists')
    blob.get_blob_properties.return_value.size=3
    blob.get_blob_properties.return_value.metadata={'sha256':'digest'}
    settings=Settings(_env_file=None,storage_account='egstorageadlshn',storage_auth_mode='managed_identity',storage_managed_identity_client_id='client-id')
    store=storage.AzureArtifactStore(settings)
    store.put('project-artifacts','safe/path',b'abc','digest')
    mi.assert_called_once_with(client_id='client-id');cli.assert_not_called()
    blob.upload_blob.assert_called_once()
    assert blob.upload_blob.call_args.kwargs['overwrite'] is False
    blob.get_blob_properties.return_value.metadata={'sha256':'other'}
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error: store.put('project-artifacts','safe/path',b'abc','digest')
    assert error.value.status_code==409


def test_blob_download_rejects_modified_content(monkeypatch):
    from unittest.mock import MagicMock
    from app.modules.artifacts import storage
    from app.core.config import Settings
    from fastapi import HTTPException
    credential=MagicMock();factory=MagicMock()
    monkeypatch.setattr(storage,'AzureCliCredential',credential)
    monkeypatch.setattr(storage,'BlobServiceClient',factory)
    blob=factory.return_value.__enter__.return_value.get_blob_client.return_value
    blob.get_blob_properties.return_value.size=3
    blob.download_blob.return_value.readall.return_value=b'bad'
    store=storage.AzureArtifactStore(Settings(_env_file=None,storage_account='egstorageadlshn'))
    with pytest.raises(HTTPException) as error: store.get('project-artifacts','path',3,hashlib.sha256(b'abc').hexdigest())
    assert error.value.status_code==503
    credential.assert_called_once()
