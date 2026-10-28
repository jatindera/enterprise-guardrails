from typing import Annotated
from uuid import UUID
from urllib.parse import quote
from fastapi import APIRouter, Depends, Path, Query, Request, Response, HTTPException
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.artifacts.storage import artifact_store
from app.modules.artifacts import service
from app.modules.artifacts.schemas import ArtifactPage, ArtifactSummary

router = APIRouter(prefix="/api/projects", tags=["Gate attachments"])
SessionDep = Annotated[Session, Depends(get_session)]
User = Annotated[dict, Depends(current_user)]
Store = Annotated[object, Depends(artifact_store)]
DemandId = Annotated[str, Path(pattern=r"^[0-9]{1,64}$")]

@router.get("/{demand_id}/pre-production-gate/attachments", response_model=ArtifactPage)
def list_files(demand_id: DemandId, session: SessionDep, user: User):
    return service.list_artifacts(session, demand_id)

@router.put("/{demand_id}/pre-production-gate/attachments/{upload_id}", response_model=ArtifactSummary)
async def upload_file(demand_id: DemandId, upload_id: UUID, request: Request, session: SessionDep, user: User,
                      store: Store, file_name: Annotated[str, Query(alias="fileName", min_length=1, max_length=260)]):
    await run_in_threadpool(service.preflight, session, demand_id, user)
    service.filename(file_name)
    length = request.headers.get("content-length")
    if length:
        if not length.isdecimal():
            raise HTTPException(400, "Invalid Content-Length.")
        if int(length) > service.MAX_BYTES:
            raise HTTPException(413, "File exceeds 20 MB.")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > service.MAX_BYTES:
            raise HTTPException(413, "File exceeds 20 MB.")
        data.extend(chunk)
    return await run_in_threadpool(service.upload, session, demand_id, upload_id, file_name, bytes(data), user, store)

@router.get("/{demand_id}/pre-production-gate/attachments/{artifact_id}/download")
def download_file(demand_id: DemandId, artifact_id: UUID, session: SessionDep, user: User, store: Store):
    name, data = service.download(session, demand_id, artifact_id, store)
    return Response(content=data, media_type="application/octet-stream", headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(name, safe=""),
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })
