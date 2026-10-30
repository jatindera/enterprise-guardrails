from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.intake import service
from app.modules.intake.schemas import IntakeContext, IntakeVersion

router = APIRouter(prefix="/api/projects", tags=["Structured project intake"], dependencies=[Depends(current_user)])
SessionDep = Annotated[Session, Depends(get_session)]
DemandId = Annotated[str, Path(pattern=r"^[0-9]{1,64}$")]

@router.get("/{demand_id}/intake-context", response_model=IntakeContext)
def get_context(demand_id: DemandId, session: SessionDep, snapshot_id: Annotated[UUID | None, Query(alias="snapshotId")] = None):
    return service.get_context(session, demand_id, snapshot_id)

@router.get("/{demand_id}/intake-versions", response_model=list[IntakeVersion])
def list_versions(demand_id: DemandId, session: SessionDep):
    return service.list_versions(session, demand_id)
