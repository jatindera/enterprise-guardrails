"""SQL reservations make failed uploads traceable and retries idempotent."""
import hashlib
import logging
from pathlib import PurePath
from fastapi import HTTPException
from azure.core.exceptions import AzureError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from app.db.models import GateArtifact, utc_now
from app.modules.arb.service import find_project, voter_identity, voter_name
from app.modules.gate.service import can_edit, DOMAINS
from app.modules.artifacts.schemas import ArtifactSummary, ArtifactPage

MAX_BYTES = 20 * 1024 * 1024
EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg"}
logger = logging.getLogger("guardrails.artifacts")

def require_upload(project, user):
    if not any(can_edit(project, domain, user) for domain in DOMAINS):
        raise HTTPException(403, "Only an assigned primary reviewer or Admin may upload gate evidence.")
    if not project.gate_required:
        raise HTTPException(409, "The Pre-Production Gate is not applicable.")

def preflight(session, demand_id, user):
    try:
        require_upload(find_project(session, demand_id), user)
    finally:
        session.rollback()

def filename(value):
    if not value or value != value.strip() or any(ord(c) < 32 or ord(c) == 127 for c in value) or any(c in value for c in '/\\'):
        raise HTTPException(422, "Use a filename without a path or control characters.")
    if len(value.encode("utf-16-le")) // 2 > 260 or PurePath(value).suffix.lower() not in EXTENSIONS:
        raise HTTPException(422, "Unsupported filename or extension.")
    return value

def list_artifacts(session, demand_id):
    project = find_project(session, demand_id)
    rows = session.scalars(select(GateArtifact).where(GateArtifact.project_id == project.id,
        GateArtifact.status == "Ready").order_by(GateArtifact.uploaded_at.desc(), GateArtifact.id.desc())).all()
    return ArtifactPage(items=[ArtifactSummary.model_validate(row) for row in rows])

def upload(session, demand_id, upload_id, name, data, user, store):
    name = filename(name)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413 if data else 422, "File must be nonempty and at most 20 MB.")
    digest = hashlib.sha256(data).hexdigest()
    store.validate()
    # Reserve metadata before touching storage. Failed uploads remain Pending and
    # can be retried with the same ID; no file is listed as saved until Ready.
    with session.begin():
        project = find_project(session, demand_id, lock=True)
        require_upload(project, user)
        record = session.get(GateArtifact, upload_id)
        if record:
            if (record.project_id != project.id or record.uploaded_by_object_id != voter_identity(user)
                    or record.file_name != name or record.sha256 != digest):
                raise HTTPException(409, "Upload identifier belongs to a different file or uploader.")
            if record.status == "Ready":
                return ArtifactSummary.model_validate(record)
            if record.storage_account != store.account:
                raise HTTPException(409, "Storage account changed. Start a new upload.")
        else:
            record = GateArtifact(id=upload_id, project_id=project.id, file_name=name, size_bytes=len(data), sha256=digest,
                storage_account=store.account, container=store.container,
                blob_name=f"{project.demand_id}/pre-production/{upload_id}/{name.rsplit('.', 1)[-1].lower()}",
                status="Pending", uploaded_by_object_id=voter_identity(user), uploaded_by_name=voter_name(user) or "Signed-in reviewer")
            session.add(record)
            session.flush()
        container, blob_name = record.container, record.blob_name
    try:
        store.put(container, blob_name, data, digest)
    except AzureError:
        logger.warning("Storage upload failed; artifact_id=%s", upload_id)
        raise HTTPException(503, "Storage upload failed. Check backend storage access, then retry the same file.") from None
    try:
        with session.begin():
            project = find_project(session, demand_id, lock=True)
            require_upload(project, user)
            record = session.get(GateArtifact, upload_id)
            if record.status != "Ready":
                record.status = "Ready"
                record.uploaded_at = utc_now()
                session.flush()
            result = ArtifactSummary.model_validate(record)
        return result
    except SQLAlchemyError:
        logger.warning("Upload confirmation failed; artifact_id=%s", upload_id)
        raise HTTPException(503, "Upload confirmation failed. Refresh the list, then retry with the same upload identifier if needed.") from None

def download(session, demand_id, artifact_id, store):
    project = find_project(session, demand_id)
    record = session.scalar(select(GateArtifact).where(GateArtifact.id == artifact_id,
        GateArtifact.project_id == project.id, GateArtifact.status == "Ready"))
    if record is None:
        raise HTTPException(404, "Attachment not found.")
    if record.storage_account != store.account:
        raise HTTPException(503, "The configured storage account differs from this attachment's account.")
    name, container, blob, size, digest = record.file_name, record.container, record.blob_name, record.size_bytes, record.sha256
    session.rollback()  # Do not keep a SQL transaction open while downloading.
    try:
        return name, store.get(container, blob, size, digest)
    except AzureError:
        logger.warning("Storage download failed; artifact_id=%s", artifact_id)
        raise HTTPException(503, "The attachment could not be downloaded. Check backend storage access and try again.") from None
