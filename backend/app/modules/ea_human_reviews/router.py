from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from . import service as s
from .schemas import CreateDraft, SaveDraft, SubmitReview, ReopenReview

router=APIRouter(prefix='/api/projects/{demand_id}/ea-assessment',tags=['Human EA assessment'])
Demand=Annotated[str,Path(pattern=r'^[0-9]{1,64}$')]
DB=Annotated[Session,Depends(get_session)]
User=Annotated[dict,Depends(current_user)]

@router.get('')
def state(demand_id:Demand,session:DB,user:User):return s.get_state(session,demand_id,user)

@router.get('/reviews/{review_id}')
def version(demand_id:Demand,review_id:UUID,session:DB,user:User):return s.get_version(session,demand_id,review_id,user)

@router.put('/reviews/{review_id}')
def create(demand_id:Demand,review_id:UUID,data:CreateDraft,session:DB,user:User):return s.create(session,demand_id,review_id,data,user)

@router.put('/reviews/{review_id}/save/{request_id}')
def save(demand_id:Demand,review_id:UUID,request_id:UUID,data:SaveDraft,session:DB,user:User):return s.save(session,demand_id,review_id,request_id,data,user)

@router.post('/reviews/{review_id}/submit/{request_id}')
def submit(demand_id:Demand,review_id:UUID,request_id:UUID,data:SubmitReview,session:DB,user:User):return s.submit(session,demand_id,review_id,request_id,data,user)

@router.post('/reviews/{review_id}/reopen/{request_id}')
def reopen(demand_id:Demand,review_id:UUID,request_id:UUID,data:ReopenReview,session:DB,user:User):return s.reopen(session,demand_id,review_id,request_id,data,user)
