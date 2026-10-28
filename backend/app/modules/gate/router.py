from typing import Annotated
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.gate import service
from app.modules.gate.schemas import Domain, GateState, SaveDecision, ChangeApplicability

router = APIRouter(prefix="/api/projects", tags=["Pre-Production Gate"])
SessionDep = Annotated[Session, Depends(get_session)]
User = Annotated[dict, Depends(current_user)]
DemandId = Annotated[str, Path(pattern=r"^[0-9]{1,64}$")]

@router.get("/{demand_id}/pre-production-gate", response_model=GateState)
def get_gate(demand_id: DemandId, session: SessionDep, user: User):
    return service.get_state(session, demand_id, user)

@router.patch("/{demand_id}/pre-production-gate/applicability", response_model=GateState)
def change_gate(demand_id: DemandId, data: ChangeApplicability, session: SessionDep, user: User):
    return service.change_applicability(session, demand_id, data, user)

@router.put("/{demand_id}/pre-production-gate/decisions/{domain}", response_model=GateState)
def save_gate(demand_id: DemandId, domain: Domain, data: SaveDecision, session: SessionDep, user: User):
    return service.save_decision(session, demand_id, domain, data, user)
