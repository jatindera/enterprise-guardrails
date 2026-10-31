from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from azure.core.exceptions import ResourceNotFoundError, ServiceRequestError
from app.modules.artifacts.storage import AzureArtifactStore


@pytest.mark.parametrize('missing', [False, True])
def test_delete_blob_and_snapshots_is_retryable(monkeypatch,missing):
    blob=Mock()
    if missing: blob.delete_blob.side_effect=ResourceNotFoundError('Missing')
    client=Mock()
    client.get_blob_client.return_value=blob
    store=AzureArtifactStore(SimpleNamespace(storage_account='egstorageadlshn',storage_container='project-artifacts'))
    monkeypatch.setattr(store,'client',lambda:nullcontext(client))
    store.delete('project-artifacts','demand/transcript.txt')
    client.get_blob_client.assert_called_once_with('project-artifacts','demand/transcript.txt')
    blob.delete_blob.assert_called_once_with(delete_snapshots='include',timeout=30)


def test_delete_storage_failure_is_not_swallowed(monkeypatch):
    client=Mock(); client.get_blob_client.return_value.delete_blob.side_effect=ServiceRequestError('Offline')
    store=AzureArtifactStore(SimpleNamespace(storage_account='egstorageadlshn',storage_container='project-artifacts'))
    monkeypatch.setattr(store,'client',lambda:nullcontext(client))
    with pytest.raises(ServiceRequestError):
        store.delete('project-artifacts','transcript')
