from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from app.modules.artifacts.service import MAX_BYTES
from app.modules.artifacts.storage import artifact_store
from app.modules.security_preparation.router import DemandId, SessionDep, UserDep, security_invoker
from . import reports, service
from app.modules.ea_meeting_reviews.service import decode, valid_filename, MAX_FILE
from .schemas import AcceptReview, Generate, HumanDraft, Reopen

router = APIRouter(prefix='/api/projects/{demand_id}/security-reviews', tags=['Security reviews'])
Store = Annotated[object, Depends(artifact_store)]


@router.get('')
def state(demand_id: DemandId, session: SessionDep, user: UserDep, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.state(session, demand_id, user)


@router.post('/generate')
def generate(demand_id: DemandId, data: Generate, session: SessionDep, user: UserDep, store: Store,
             invoke=Depends(security_invoker)):
    return service.generate(session, demand_id, data, user, invoke, store)


@router.get('/ai/{review_revision}/transcripts/{number}/download')
def transcript(demand_id: DemandId, review_revision: int, number: int, session: SessionDep, user: UserDep, store: Store):
    name, content = service.transcript(session, demand_id, review_revision, number, user, store)
    return attachment(name, content)


@router.post('/accept')
def accept(demand_id: DemandId, data: AcceptReview, session: SessionDep, user: UserDep):
    return service.accept(session, demand_id, data.expected_revision, user, data.review_revision)


@router.put('/human')
def save(demand_id: DemandId, data: HumanDraft, session: SessionDep, user: UserDep):
    return service.save_human(session, demand_id, data, user)


@router.post('/human/submit')
def submit(demand_id: DemandId, data: HumanDraft, session: SessionDep, user: UserDep):
    return service.save_human(session, demand_id, data, user, submit=True)


@router.post('/human/reopen')
def reopen(demand_id: DemandId, data: Reopen, session: SessionDep, user: UserDep):
    return service.reopen(session, demand_id, data, user)


@router.put('/transcripts/{file_id}')
async def upload_transcript(demand_id: DemandId, file_id: UUID, request: Request, session: SessionDep,
                            user: UserDep, store: Store,
                            file_name: Annotated[str, Query(alias='fileName', min_length=1, max_length=260)]):
    await run_in_threadpool(reports.preflight, session, demand_id, user)
    valid_filename(file_name)
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_FILE:
            raise HTTPException(413, 'Maximum 2 MB per transcript.')
        data.extend(chunk)
    decode(data)
    return await run_in_threadpool(reports.save_file, session, demand_id, file_id, file_name,
                                   bytes(data), user, store, 'Transcript', 'transcripts', 'txt')


@router.get('/transcripts/{file_id}/download')
def download_transcript(demand_id: DemandId, file_id: UUID, session: SessionDep, user: UserDep, store: Store):
    name, content = reports.download(session, demand_id, file_id, user, store, kind='Transcript')
    return attachment(name, content)


@router.delete('/transcripts/{file_id}', status_code=204)
def delete_transcript(demand_id: DemandId, file_id: UUID, session: SessionDep, user: UserDep, store: Store):
    reports.delete_transcript(session, demand_id, file_id, user, store)
    return Response(status_code=204)


@router.put('/reports/{report_id}')
async def upload(demand_id: DemandId, report_id: UUID, request: Request, session: SessionDep, user: UserDep,
                 store: Store, file_name: Annotated[str, Query(alias='fileName', min_length=1, max_length=260)]):
    await run_in_threadpool(reports.preflight, session, demand_id, user)
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, 'Closing reports can be up to 20 MB.')
        data.extend(chunk)
    return await run_in_threadpool(reports.upload, session, demand_id, report_id, file_name, bytes(data), user, store)


@router.get('/reports/{report_id}/download')
def download(demand_id: DemandId, report_id: UUID, session: SessionDep, user: UserDep, store: Store):
    name, content = reports.download(session, demand_id, report_id, user, store)
    return attachment(name, content)


def attachment(name, content):
    return Response(content, media_type='application/octet-stream', headers={
        'Content-Disposition': "attachment; filename*=UTF-8''" + quote(name, safe=''),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    })
