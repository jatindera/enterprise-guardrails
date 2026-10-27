from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.core.auth import current_user, require_admin
from app.db.session import get_session
from app.modules.projects import service
from app.modules.projects.schemas import ImportProject, ProjectDetail, ProjectPage, UpdateRAIAssignment


router = APIRouter(prefix="/api/projects", tags=["Projects"], dependencies=[Depends(current_user)])
DatabaseSession = Annotated[Session, Depends(get_session)]


@router.get("", response_model=ProjectPage)
def list_projects(
    session: DatabaseSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ProjectPage:
    return service.list_projects(session, offset, limit)


@router.post("/import", response_model=ProjectDetail, dependencies=[Depends(require_admin)])
def import_project(data: ImportProject, response: Response, session: DatabaseSession) -> ProjectDetail:
    result, created = service.import_project(session, data)
    response.status_code = 201 if created else 200
    return result


@router.get("/{demand_id}", response_model=ProjectDetail)
def get_project(
    demand_id: Annotated[str, Path(pattern=r"^[0-9]{1,64}$")],
    session: DatabaseSession,
) -> ProjectDetail:
    return service.get_project(session, demand_id)


@router.patch("/{demand_id}/rai-assignment", response_model=ProjectDetail, dependencies=[Depends(require_admin)])
def update_rai_assignment(
    demand_id: Annotated[str, Path(pattern=r"^[0-9]{1,64}$")],
    data: UpdateRAIAssignment,
    session: DatabaseSession,
) -> ProjectDetail:
    return service.update_rai_assignment(session, demand_id, data)
