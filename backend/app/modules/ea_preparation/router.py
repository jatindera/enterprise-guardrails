import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.models import Project
from app.db.session import get_session
from app.agents.enterprise_architecture.profiles import PREPARE_QUESTIONS, PREPARATION_CHAT
from app.agents.enterprise_architecture.context import EAProjectContext, preparation_input
from app.modules.intake.service import get_context
from app.modules.projects.ea_access import ea_permissions
from .execution import invoke_ea
from .schemas import ChatRequest, ChatReply, QuestionsReply

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/projects', tags=['EA preparation'])
DemandId = Annotated[str, Path(pattern=r'^[0-9]{1,64}$')]
SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[dict, Depends(current_user)]


def authorized_context(session, demand_id, user):
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, 'Project not found.')
    if not ea_permissions(user, project.assigned_ea_object_id, project.additional_ea_object_id)[0]:
        raise HTTPException(403, 'Only the assigned EA, additional EA, or Admin may use EA preparation.')
    context = EAProjectContext(demand_id=project.demand_id, project_name=project.name,
        business_function=project.business_function, intake=get_context(session, demand_id))
    session.close()  # Release the SQL connection before remote inference.
    return context


def complete(context, task, response_type, invoke):
    try:
        payload = preparation_input(context, task)
    except ValueError:
        raise HTTPException(422, 'Project context is too large. Contact your administrator.') from None
    try:
        text = invoke(payload).strip()
        # Tolerate a single Markdown JSON fence; never extract partial JSON.
        if text.startswith('```json\n') and text.endswith('```'):
            text = text[8:-3].strip()
        return response_type.model_validate_json(text)
    except Exception as exc:
        logger.warning('EA preparation failed; exception_type=%s', type(exc).__name__)
        raise HTTPException(502, 'EA assistant could not complete this request. Check Foundry configuration and access, then retry.') from None


def hosted_invoker():
    return invoke_ea


@router.post('/{demand_id}/ea-preparation/questions', response_model=QuestionsReply)
def questions(demand_id: DemandId, session: SessionDep, user: UserDep, invoke=Depends(hosted_invoker)):
    context = authorized_context(session, demand_id, user)
    task = PREPARE_QUESTIONS.render()
    return complete(context, task, QuestionsReply, invoke)


@router.post('/{demand_id}/ea-preparation/chat', response_model=ChatReply)
def chat(demand_id: DemandId, data: ChatRequest, session: SessionDep, user: UserDep, invoke=Depends(hosted_invoker)):
    context = authorized_context(session, demand_id, user)
    try:
        task = PREPARATION_CHAT.render(message=data.message,
            history=[m.model_dump() for m in data.history])
    except ValueError:
        raise HTTPException(422, 'Conversation is too long. Clear the chat and try again.') from None
    return complete(context, task, ChatReply, invoke)
