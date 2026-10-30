# Pre-Production Gate — shared storage attachments

Copy the backend and frontend folders from this ZIP into the matching folders of your project. This increment builds on the database-backed gate decisions package. Preserve your existing environment settings and other files.

## Changes

- Optional gate attachments are uploaded to egstorageadlshn in the private project-artifacts container.
- A single Select files button supports multiple files and drag-and-drop. Files upload one at a time, with success/failure states and a Retry upload button.
- Primary EA, Security, and RAI, plus Admin, may upload. Additional reviewers and unrelated users cannot upload. FastAPI enforces these rules and the gate-required flag.
- Every signed-in application user can list/download saved attachments. Files persist after browser refresh and are common to the reviewers.
- Downloads go through the authenticated backend; no public blob URLs, browser storage credentials, or SAS links are exposed.
- The previously discussed Awaiting classification badge and explanatory sentence are removed.
- Attachments remain optional; no change to reviewer decision requirements or combined approval rules.
- No attachment deletion/replacement action is introduced. Selecting the same filename as a new upload creates another artifact; it does not overwrite the earlier file.

## 1. Azure prerequisites

You already created the account and container. Confirm:

- Storage account: egstorageadlshn
- Container: project-artifacts
- Hierarchical namespace: enabled
- The container is private (no anonymous public read access).
- The account used by az login on the computer running FastAPI has Storage Blob Data Contributor at container or account scope. Azure subscription Contributor alone is not a data access role.
- The storage network settings allow the backend computer to reach the account. If restricted to selected networks, allow the appropriate local outbound IP for your development test.

No browser-to-storage CORS setting is required because file access goes through FastAPI. No new Azure resource or key is required.

## 2. Add these settings to backend/.env

    APP_STORAGE_ACCOUNT=egstorageadlshn
    APP_STORAGE_CONTAINER=project-artifacts
    APP_STORAGE_AUTH_MODE=azure_cli

The included backend/.env.storage.example contains the same settings. Add these lines; do not replace your existing SQL/Entra settings.

Sign in locally:

    az login --tenant c643d250-0dd7-416f-889e-a93f0e4ef800

If Azure CLI is already logged in to the correct tenant, you can keep that session. Restart FastAPI after changing .env.

For a later Azure deployment, enable the backend app's managed identity, grant it Storage Blob Data Contributor on this container, and set:

    APP_STORAGE_AUTH_MODE=managed_identity

For a user-assigned identity only, also set APP_STORAGE_MANAGED_IDENTITY_CLIENT_ID to its client ID. System-assigned identity needs no client ID setting. This code uses the selected identity explicitly rather than silently falling back to another credential.

## 3. Install dependency and run migration

Stop the backend. Open PowerShell in backend:

    uv sync --frozen
    uv run alembic upgrade head
    uv run alembic current
    uv run python -m pytest -q

The new locked dependency is azure-storage-blob (12.31.0 in this package). The migration adds gate_artifacts and does not change or delete existing decisions.

Expected current migration:

    20261028_gate_artifacts

Restart the backend using your usual command.

## 4. Frontend

In frontend:

    npm run build
    npx vitest run tests/GateAttachments.test.tsx tests/ProductionGate.test.tsx src/api/projects.test.ts tests/ARBVoting.test.tsx tests/gateWorkflow.test.ts
    npm run dev

Refresh your browser after updating both sides.

## 5. Verify with your Azure account

1. Sign in as a primary reviewer or Admin. Open a project whose gate is required, then Production > Pre-Production Gate.
2. Select two small supported files in one selection. Confirm each reaches the saved list and the success message says the attachments were saved to storage.
3. Refresh the browser. Confirm both files remain, with uploader name, size, and date.
4. Download each file. Confirm its contents match the original.
5. Sign in as another assigned primary reviewer and confirm the same files appear and another file can be uploaded.
6. Sign in as a general user or additional reviewer. The saved files should be readable/downloadable, but uploads should be disabled.
7. Drag two files into the upload area. Confirm both are saved.
8. Approve a decision on a project with no files. Confirm evidence is still optional.
9. Check the Admin not-applicable checkbox. The gate form should hide. Uncheck it and confirm earlier attachments remain. Upload attempts while not required must be rejected by the backend.
10. In Azure Portal > egstorageadlshn > project-artifacts, confirm objects exist under the demand ID's pre-production directory.

Storage path format:

    <demand-id>/pre-production/<artifact-uuid>/<extension>

Original filename, SHA-256, uploader identity/name, size, storage account/container/path, and upload status are stored in Azure SQL. The opaque storage object path avoids relying on filenames as identifiers.

## Failure handling

Each file is capped at 20 MiB and validated on the frontend and backend. The API accepts the same supported extensions as the UI. It stores binary content and serves it as a download; extension validation is not malware scanning or document content validation.

An upload first reserves a Pending SQL record, then writes a private blob, then confirms Ready in SQL. Only Ready files appear as saved. A storage failure or interrupted confirmation remains traceable. Retry upload reuses the same ID and verifies the content, preventing another attachment or blob overwrite for that retry. Separate new selections intentionally receive new IDs.

If the browser reports a timeout, refresh/list results may show that the upload completed. Retrying within the same open page is safe. Pending local File objects are not retained across a page refresh; a Pending SQL reservation may remain for operational investigation. There is no automatic deletion/cleanup job in this increment.

If permissions or applicability change while a file is uploading, the final permission check can prevent publication. Such a file remains Pending in SQL, with any written storage object tracked by that record.

Troubleshooting:

- A 503 upload/download response: check backend storage .env values, az login tenant, Storage Blob Data Contributor assignment, and storage firewall/network rules. Role changes may take time to propagate.
- A 403 response: the signed-in app user does not have primary-reviewer/Admin upload permission.
- A 409 response: applicability or upload identity/content changed; refresh and inspect the displayed message.
- Do not grant every frontend user Azure storage RBAC. Backend identity accesses storage; FastAPI applies application permissions to the signed-in users.

## SQL checks

    SELECT p.demand_id, a.file_name, a.size_bytes, a.status,
           a.uploaded_by_name, a.uploaded_at, a.storage_account,
           a.container, a.blob_name, a.sha256
    FROM dbo.gate_artifacts a
    JOIN dbo.projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC;

Pending uploads, if troubleshooting is needed:

    SELECT id, project_id, file_name, created_at, storage_account, container, blob_name
    FROM dbo.gate_artifacts
    WHERE status = 'Pending'
    ORDER BY created_at DESC;

## API

    GET /api/projects/{demand_id}/pre-production-gate/attachments
    PUT /api/projects/{demand_id}/pre-production-gate/attachments/{upload_id}?fileName=evidence.pdf
    GET /api/projects/{demand_id}/pre-production-gate/attachments/{artifact_id}/download

PUT uses raw file bytes with Content-Type application/octet-stream and a client-generated UUID for retry identity. All endpoints require the existing API access token; PUT additionally checks assigned-primary/Admin permissions and gate applicability.

## Verification completed

193 backend tests passed, 1 skipped, plus 3 subtests passed. Tests cover authorization, metadata persistence, shared authenticated downloads, size/filename validation, retry identity, SQL/storage interruption recovery, and SQL Server migration compilation. Azure storage calls are mocked in automated tests.

48 targeted frontend tests passed; production build passed with the existing bundle-size advisory.

No live connection to your Azure account was made here. Complete the local Azure upload/download checks before considering cloud integration verified.

Microsoft references:

- https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-upload-python
- https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-python-get-started
