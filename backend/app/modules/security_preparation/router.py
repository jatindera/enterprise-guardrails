import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.agents.enterprise_architecture.context import EAProjectContext
from app.db.models import Project, MeetingPreparationRecord, MeetingPreparedQuestion
from app.modules.intake.service import get_context
from app.modules.meetings.router import editable, find_project
from app.modules.ea_preparation.router import DemandId, SessionDep, UserDep, complete
from app.modules.ea_preparation.schemas import ChatRequest, ChatReply, QuestionsReply
from .execution import invoke_security
from .profiles import SECURITY_CHAT, SECURITY_MEETING_CHAT, SECURITY_QUESTIONS, SECURITY_REDIRECT

router = APIRouter(prefix='/api/projects', tags=['Security preparation'])


def security_invoker():
    return invoke_security


def authorized_context(session, demand_id, user):
    project = find_project(session, demand_id)
    if not editable(project, 'Security', user):
        raise HTTPException(403, 'Only assigned Security reviewers or Admin may use Security preparation.')
    context = EAProjectContext(demand_id=project.demand_id, project_name=project.name,
        business_function=project.business_function, intake=get_context(session, demand_id))
    session.close()
    return context


def current_question(session, demand_id):
    # Read only the current question saved for this project and domain.
    current = session.scalar(select(MeetingPreparedQuestion.question)
        .join(MeetingPreparationRecord, MeetingPreparedQuestion.preparation_id == MeetingPreparationRecord.id)
        .join(Project, MeetingPreparationRecord.project_id == Project.id)
        .where(Project.demand_id == demand_id, MeetingPreparationRecord.domain == 'Security',
               MeetingPreparedQuestion.id == MeetingPreparationRecord.current_question_id))
    session.close()  # Do not hold a SQL connection during model/search requests.
    return current


@router.post('/{demand_id}/security-preparation/questions', response_model=QuestionsReply)
def security_questions(demand_id: DemandId, session: SessionDep, user: UserDep, invoke=Depends(security_invoker)):
    context = authorized_context(session, demand_id, user)
    return complete(context, SECURITY_QUESTIONS.render(), QuestionsReply, invoke, 'Security')


def answer_security_chat(demand_id, data, session, user, invoke, *, meeting=False):
    context = authorized_context(session, demand_id, user)
    if data.search_web:
        raise HTTPException(422, 'Public web search is unavailable in Security chat.')
    profile = SECURITY_MEETING_CHAT if meeting else SECURITY_CHAT
    try:
        task = profile.render(message=data.message, history=[m.model_dump() for m in data.history])
        if meeting:
            current = current_question(session, demand_id)
            task += '\nUntrusted meeting context: ' + json.dumps({
                'current_question': current, 'live_transcript_available': False,
            }, ensure_ascii=False)
        if len(task) > 16000:
            raise ValueError('Security chat input too large.')
    except ValueError:
        raise HTTPException(422, 'Conversation is too long. Clear the chat and try again.') from None
    reply = complete(context, task, ChatReply, invoke, 'Security')
    if reply.out_of_scope:
        return ChatReply(text=SECURITY_REDIRECT, out_of_scope=True)
    return ChatReply(text=reply.text, proposedQuestion=reply.proposed_question)


@router.post('/{demand_id}/security-preparation/chat', response_model=ChatReply)
def security_chat(demand_id: DemandId, data: ChatRequest, session: SessionDep, user: UserDep,
                  invoke=Depends(security_invoker)):
    return answer_security_chat(demand_id, data, session, user, invoke)


@router.post('/{demand_id}/security-preparation/meeting-chat', response_model=ChatReply)
def security_meeting_chat(demand_id: DemandId, data: ChatRequest, session: SessionDep, user: UserDep,
                          invoke=Depends(security_invoker)):
    return answer_security_chat(demand_id, data, session, user, invoke, meeting=True)


