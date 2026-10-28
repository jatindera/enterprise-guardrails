from typing import Annotated
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.arb import service
from app.modules.arb.schemas import SubmitVote, VotingResult

router = APIRouter(prefix="/api/projects", tags=["ARB voting"])
DemandId = Annotated[str, Path(pattern=r"^[0-9]{1,64}$")]
DatabaseSession = Annotated[Session, Depends(get_session)]
User = Annotated[dict, Depends(current_user)]


@router.get("/{demand_id}/arb-voting", response_model=VotingResult)
def get_voting(demand_id: DemandId, session: DatabaseSession, user: User) -> VotingResult:
    return service.get_results(session, demand_id, user)


@router.put("/{demand_id}/arb-vote", response_model=VotingResult)
def record_vote(demand_id: DemandId, data: SubmitVote, session: DatabaseSession, user: User) -> VotingResult:
    return service.submit_vote(session, demand_id, data, user)
