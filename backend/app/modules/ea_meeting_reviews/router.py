from typing import Annotated
from uuid import UUID
from urllib.parse import quote
from fastapi import APIRouter, Depends, Path, Query, Request, Response, HTTPException
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.artifacts.storage import artifact_store
from app.modules.ea_preparation.router import hosted_invoker
from . import service as s
from .schemas import CreateMeeting, Revision, EditReview

router=APIRouter(prefix='/api/projects/{demand_id}/ea-review',tags=['EA meeting reviews'])
Demand=Annotated[str,Path(pattern=r'^[0-9]{1,64}$')]
DB=Annotated[Session,Depends(get_session)]
User=Annotated[dict,Depends(current_user)]
Store=Annotated[object,Depends(artifact_store)]

@router.get('/meetings')
def listing(demand_id:Demand,session:DB,user:User): return s.list_meetings(session,demand_id,user)

@router.post('/meetings')
def create(demand_id:Demand,data:CreateMeeting,session:DB,user:User):
    return s.create_meeting(session,demand_id,user,data.title)

@router.get('/meetings/{meeting_id}')
def details(demand_id:Demand,meeting_id:UUID,session:DB,user:User):
    project,permissions=s.project_access(session,demand_id,user)
    return s.detail(session,project,s.meeting_for(session,project,meeting_id),permissions)

@router.put('/meetings/{meeting_id}/transcripts/{upload_id}')
async def upload(demand_id:Demand,meeting_id:UUID,upload_id:UUID,request:Request,session:DB,user:User,store:Store,
                 file_name:Annotated[str,Query(alias='fileName',min_length=1,max_length=260)]):
    await run_in_threadpool(s.preflight,session,demand_id,meeting_id,user)
    s.valid_filename(file_name)
    length=request.headers.get('content-length')
    if length and (not length.isdecimal() or int(length)>s.MAX_FILE): raise HTTPException(413,'Maximum 2 MB per transcript.')
    data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>s.MAX_FILE: raise HTTPException(413,'Maximum 2 MB per transcript.')
        data.extend(chunk)
    return await run_in_threadpool(s.upload,session,demand_id,meeting_id,upload_id,file_name,bytes(data),user,store)

@router.delete('/meetings/{meeting_id}/transcripts/{file_id}')
def remove(demand_id:Demand,meeting_id:UUID,file_id:UUID,session:DB,user:User,store:Store):
    s.remove(session,demand_id,meeting_id,file_id,user,store)
    return {'completed': True}

@router.get('/meetings/{meeting_id}/transcripts/{file_id}/download')
def download(demand_id:Demand,meeting_id:UUID,file_id:UUID,session:DB,user:User,store:Store):
    name,data=s.download(session,demand_id,meeting_id,file_id,user,store)
    return Response(data,media_type='application/octet-stream',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(name,safe=''),
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})

@router.put('/meetings/{meeting_id}/reviews/{review_id}/generate')
def generate(demand_id:Demand,meeting_id:UUID,review_id:UUID,data:Revision,session:DB,user:User,store:Store,invoke=Depends(hosted_invoker)):
    return s.generate(session,demand_id,meeting_id,review_id,data.expected_revision,user,store,invoke)

@router.put('/meetings/{meeting_id}/reviews/{review_id}/edit')
def edit(demand_id:Demand,meeting_id:UUID,review_id:UUID,data:EditReview,session:DB,user:User):
    return s.edit_review(session,demand_id,meeting_id,review_id,data,user)

@router.post('/meetings/{meeting_id}/reviews/{review_id}/accept')
def accept(demand_id:Demand,meeting_id:UUID,review_id:UUID,data:Revision,session:DB,user:User):
    return s.accept_review(session,demand_id,meeting_id,review_id,data.expected_revision,user)

@router.post('/meetings/{meeting_id}/reviews/{review_id}/recover')
def recover(demand_id:Demand,meeting_id:UUID,review_id:UUID,session:DB,user:User):
    s.recover(session,demand_id,meeting_id,review_id,user)
    return {'completed': True}
