"""Private Blob API access, compatible with the HNS-enabled ADLS account."""
import hashlib
import re
from contextlib import contextmanager
from fastapi import HTTPException, Request
from azure.core.exceptions import ResourceExistsError
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

class AzureArtifactStore:
    def __init__(self, settings):
        self.settings = settings
        self.account = settings.storage_account
        self.container = settings.storage_container

    def validate(self):
        if not re.fullmatch(r"[a-z0-9]{3,24}", self.account):
            raise HTTPException(503, "Configure APP_STORAGE_ACCOUNT on the backend.")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", self.container) or "--" in self.container:
            raise HTTPException(503, "Configure a valid APP_STORAGE_CONTAINER.")

    @contextmanager
    def client(self):
        self.validate()
        if self.settings.storage_auth_mode == "azure_cli":
            credential = AzureCliCredential(tenant_id=self.settings.entra_tenant_id)
        else:
            credential = ManagedIdentityCredential(client_id=self.settings.storage_managed_identity_client_id)
        with credential, BlobServiceClient(f"https://{self.account}.blob.core.windows.net", credential=credential,
                connection_timeout=10, read_timeout=30, retry_total=1) as client:
            yield client

    def put(self, container, name, data, digest):
        with self.client() as client:
            blob = client.get_blob_client(container, name)
            try:
                blob.upload_blob(data, overwrite=False, metadata={"sha256": digest},
                    content_settings=ContentSettings(content_type="application/octet-stream"), timeout=30)
            except ResourceExistsError:
                # A retry after an interrupted response may find an already uploaded blob.
                props = blob.get_blob_properties(timeout=30)
                if props.size != len(data) or props.metadata.get("sha256") != digest:
                    raise HTTPException(409, "Upload identifier already contains different data.") from None

    def get(self, container, name, size, digest):
        with self.client() as client:
            blob = client.get_blob_client(container, name)
            props = blob.get_blob_properties(timeout=30)
            if props.size != size:
                raise HTTPException(503, "Stored file size does not match its record.")
            data = blob.download_blob(length=size, timeout=30).readall()
            if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
                raise HTTPException(503, "Stored file integrity could not be verified.")
            return data

def artifact_store(request: Request):
    return AzureArtifactStore(request.app.state.token_verifier.settings)
