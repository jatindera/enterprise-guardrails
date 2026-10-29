from typing import Annotated
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.production import service
from app.modules.production.schemas import DeploymentState, SubmitDeployment

router = APIRouter(prefix="/api/projects", tags=["Production deployment results"])
SessionDep = Annotated[Session, Depends(get_session)]
User = Annotated[dict, Depends(current_user)]
DemandId = Annotated[str, Path(pattern=r"^[0-9]{1,64}$")]

@router.get("/{demand_id}/production-deployment", response_model=DeploymentState)
def get_deployment(demand_id: DemandId, session: SessionDep, user: User):
    return service.get_state(session, demand_id, user)

@router.put("/{demand_id}/production-deployment", response_model=DeploymentState)
def submit_deployment(demand_id: DemandId, data: SubmitDeployment, session: SessionDep, user: User):
    return service.submit(session, demand_id, data, user)
