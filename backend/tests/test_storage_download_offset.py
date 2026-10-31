"""Exercise the real Azure BlobClient download argument validation, without network."""
import hashlib
from contextlib import nullcontext
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from azure.storage.blob import BlobClient
import azure.storage.blob._blob_client as sdk
from app.modules.artifacts.storage import AzureArtifactStore


@pytest.mark.parametrize('corrupt', [False, True])
def test_real_sdk_download_range_and_integrity(monkeypatch, corrupt):
    data = b'Original transcript'
    recorded = {}
    blob = BlobClient('https://example.blob.core.windows.net', 'project-artifacts', 'transcript.txt')
    monkeypatch.setattr(blob, 'get_blob_properties', lambda **_: SimpleNamespace(size=len(data)))
    def downloader(**options):
        recorded.update(options)
        return SimpleNamespace(readall=lambda: b'corrupt' if corrupt else data)
    # Only the network downloader is replaced. Real BlobClient.download_blob
    # still validates offset/length and constructs its range options.
    monkeypatch.setattr(sdk, 'StorageStreamDownloader', downloader)
    store = AzureArtifactStore(SimpleNamespace(storage_account='egstorageadlshn', storage_container='project-artifacts'))
    monkeypatch.setattr(store, 'client', lambda: nullcontext(SimpleNamespace(get_blob_client=lambda *_: blob)))
    try:
        if corrupt:
            with pytest.raises(HTTPException) as error:
                store.get('project-artifacts', 'transcript.txt', len(data), hashlib.sha256(data).hexdigest())
            assert error.value.status_code == 503
        else:
            assert store.get('project-artifacts', 'transcript.txt', len(data), hashlib.sha256(data).hexdigest()) == data
        assert recorded['start_range'] == 0
        assert recorded['end_range'] == len(data) - 1
    finally:
        blob.close()
