from datetime import timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from app.core.auth import current_user
from app.db.models import Project, MeetingPreparationRecord, MeetingPreparedQuestion, utc_now
from app.db.session import get_session
from app.modules.projects.ea_access import ea_permissions
from app.modules.projects.security_access import security_permissions
from app.modules.projects.rai_access import rai_permissions
from .schemas import Domain, Question, SaveMeeting, MeetingState

router = APIRouter(prefix='/api/projects', tags=['Meeting preparation'])
SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[dict, Depends(current_user)]
DemandId = Annotated[str, Path(pattern=r'^[0-9]{1,64}$')]
ACCESS = {'EA': ('ea', ea_permissions), 'Security': ('security', security_permissions), 'RAI': ('rai', rai_permissions)}


def find_project(session, demand_id, locked=False):
    stmt = select(Project).where(Project.demand_id == demand_id)
    if locked:
        stmt = stmt.with_hint(Project, 'WITH (UPDLOCK, HOLDLOCK)', dialect_name='mssql')
    project = session.scalar(stmt)
    if project is None:
        raise HTTPException(404, 'Project not found.')
    return project


def editable(project, domain, user):
    name, policy = ACCESS[domain]
    return policy(user, getattr(project, f'assigned_{name}_object_id'), getattr(project, f'additional_{name}_object_id'))[0]


def record_for(session, project, domain):
    return session.scalar(select(MeetingPreparationRecord).where(
        MeetingPreparationRecord.project_id == project.id, MeetingPreparationRecord.domain == domain))


def view(session, record, domain, can_edit):
    if record is None:
        return MeetingState(revision=0, can_edit=can_edit)
    rows = list(session.scalars(select(MeetingPreparedQuestion).where(
        MeetingPreparedQuestion.preparation_id == record.id).order_by(MeetingPreparedQuestion.position)))
    def question(row):
        return Question(id=row.id, focus=domain, question=row.question, reason=row.reason,
            priority=row.priority, source=row.source, selected=row.selected)
    def asked_time(row):
        value = row.asked_at
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    asked = sorted((r for r in rows if r.asked_at), key=lambda r: (r.asked_order if r.asked_order is not None else r.position))
    return MeetingState(revision=record.revision, can_edit=can_edit,
        prepared_questions=[question(r) for r in rows if r.kind == 'prepared'],
        additional_questions=[question(r) for r in rows if r.kind == 'additional'],
        current_question_id=record.current_question_id,
        asked_question_ids=[r.id for r in asked], asked_at={r.id: asked_time(r) for r in asked})


@router.get('/{demand_id}/meeting-preparation/{domain}', response_model=MeetingState)
def get_meeting(demand_id: DemandId, domain: Domain, session: SessionDep, user: UserDep):
    project = find_project(session, demand_id)
    return view(session, record_for(session, project, domain), domain, editable(project, domain, user))


@router.put('/{demand_id}/meeting-preparation/{domain}', response_model=MeetingState)
def save_meeting(demand_id: DemandId, domain: Domain, data: SaveMeeting, session: SessionDep, user: UserDep):
    try:
        with session.begin():
            project = find_project(session, demand_id, locked=True)
            if not editable(project, domain, user):
                raise HTTPException(403, 'Only assigned reviewers, additional reviewers with the domain role, or Admin may edit this meeting.')
            questions = data.prepared_questions + data.additional_questions
            if any(q.focus != domain for q in questions):
                raise HTTPException(422, 'Question domain does not match this assessment.')
            record = record_for(session, project, domain)
            if (record.revision if record else 0) != data.expected_revision:
                raise HTTPException(409, 'Another reviewer changed this meeting. Reload saved questions before editing again.')
            if record is None:
                record = MeetingPreparationRecord(project_id=project.id, domain=domain, updated_by=str(user.get('objectId', '')))
                session.add(record)
                session.flush()
            existing = {r.id: r for r in session.scalars(select(MeetingPreparedQuestion).where(MeetingPreparedQuestion.preparation_id == record.id))}
            incoming = {q.id: q for q in questions}
            for row in existing.values():
                if row.asked_at and (row.id not in incoming or row.id not in data.asked_question_ids
                        or incoming[row.id].question != row.question):
                    raise HTTPException(422, 'Asked question text and history cannot be removed or changed.')
            prior_asked = sorted((r for r in existing.values() if r.asked_at), key=lambda r: r.asked_order)
            if data.asked_question_ids[:len(prior_asked)] != [r.id for r in prior_asked]:
                raise HTTPException(422, 'Asked question history cannot be reordered.')
            asked_order = {key: index for index, key in enumerate(data.asked_question_ids)}
            now = utc_now()
            prepared_ids = {q.id for q in data.prepared_questions}
            for position, q in enumerate(questions):
                row = existing.get(q.id)
                if row is None:
                    row = MeetingPreparedQuestion(preparation_id=record.id, id=q.id)
                    session.add(row)
                row.kind = 'prepared' if q.id in prepared_ids else 'additional'
                row.position = position
                row.question, row.reason, row.priority = q.question, q.reason, q.priority
                row.source, row.selected = q.source, q.selected
                if q.id in data.asked_question_ids and row.asked_at is None:
                    row.asked_at = now
                    row.asked_order = asked_order[q.id]
            for key, row in existing.items():
                if key not in incoming:
                    session.delete(row)
            record.current_question_id = data.current_question_id
            record.updated_at = now
            record.updated_by = str(user.get('objectId', ''))
            session.flush()
            result = view(session, record, domain, True)
        return result
    except (StaleDataError, IntegrityError):
        session.rollback()
        raise HTTPException(409, 'Meeting changed while saving. Reload saved questions before editing again.') from None
