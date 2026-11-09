"""Human review authority. Project locks serialize writes; drafts never approve."""
import hashlib
import json
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select
from app.db.models import EAArchitectureDiagram, EAHumanReview, EAHumanReviewEvent, EAMeetingReview, EAReviewMeeting, utc_now
from app.modules.ea_meeting_reviews import service as ai

ARCHITECTURE_FIELDS = ('review_text', 'technology_stack', 'technology_rationale', 'decision_rationale', 'conditions')
FIELDS=('review_text','technology_stack','technology_rationale','complexity','decision','decision_rationale','conditions','diagram_id','diagram_confirmed','diagram_requirement','diagram_justification','diagram_owner','diagram_due_date')

def name(user):
    value=str(user.get('name') or user.get('username') or 'Reviewer')
    return value.encode('utf-16-le')[:400].decode('utf-16-le',errors='ignore')
def sha(text): return hashlib.sha256(text.encode()).hexdigest()

def access(session,demand_id,user,write=False):
    return ai.project_access(session,demand_id,user,accept=write,lock=write)

def all_reviews(session,project):
    return list(session.scalars(select(EAHumanReview).where(EAHumanReview.project_id==project.id).order_by(EAHumanReview.version)))

def owned(session,project,review_id):
    row=session.get(EAHumanReview,review_id)
    if not row or row.project_id!=project.id: raise HTTPException(404,'Human review not found.')
    return row

def current(session,project,row,expected,status='Draft'):
    latest=all_reviews(session,project)
    if not latest or latest[-1].id!=row.id: raise HTTPException(409,'Historical human reviews are read-only.')
    if row.status!=status: raise HTTPException(409,'Human review is not in the required state. Reopen a submitted review before editing.')
    if row.revision!=expected: raise HTTPException(409,'Human review changed. Reload before continuing.')

def project_revision(project,expected):
    if project.revision!=expected: raise HTTPException(409,'Project or assignments changed. Reload before continuing.')

def source_state(session,project,row_id):
    source=session.get(EAMeetingReview,row_id)
    meeting=session.get(EAReviewMeeting,source.meeting_id) if source else None
    if not source or not meeting or meeting.project_id!=project.id:
        raise HTTPException(404,'Source AI review not found in this project.')
    if source.status!='Accepted' or not source.review_text:
        return source,True
    if meeting.state!='Accepted' or not ai.is_current(session,meeting): return source,True
    latest=ai.latest_accepted(session,project)
    if latest is None or latest.id!=source.id: return source,True
    # All source result sets are consumed before issuing the next SQL query.
    _,digest,_=ai.snapshot(session,project,meeting)
    return source,digest!=source.input_digest

def changed(session,project,row):
    source,stale=source_state(session,project,row.source_review_id)
    return source,(stale or source.input_digest!=row.source_input_digest or sha(source.review_text or '')!=row.source_text_sha256)

def view(row):
    return dict(id=str(row.id),version=row.version,revision=row.revision,status=row.status,
        sourceReviewId=str(row.source_review_id),parentReviewId=str(row.parent_review_id) if row.parent_review_id else None,
        diagramFileName=row.diagram_file_name,
        **{''.join([key.split('_')[0]]+[part.title() for part in key.split('_')[1:]]):
            str(getattr(row,key)) if key in ('diagram_id','diagram_due_date') and getattr(row,key) is not None else getattr(row,key) for key in FIELDS},
        createdAt=ai.iso(row.created_at),updatedAt=ai.iso(row.updated_at),createdBy=row.created_by_name,
        updatedBy=row.updated_by_name,submittedAt=ai.iso(row.submitted_at),submittedBy=row.submitted_by_name)

def intent(action,target,data):
    return sha(json.dumps(dict(action=action,target=str(target),data=data.model_dump(mode='json')),sort_keys=True,ensure_ascii=False))

def replay(session,project,request_id,digest,user):
    event=session.get(EAHumanReviewEvent,request_id)
    if not event:return None
    if event.project_id!=project.id or event.created_by!=ai.oid(user) or event.intent_hash!=digest:
        raise HTTPException(409,'Request ID already used for a different operation.')
    return owned(session,project,event.review_id)

def audit(session,project,row,request_id,action,digest,user,reason=None):
    session.flush()
    session.add(EAHumanReviewEvent(id=request_id,project_id=project.id,review_id=row.id,
        action=action,review_revision=row.revision,intent_hash=digest,payload=json.dumps(view(row),ensure_ascii=False),
        reason=reason,created_by=ai.oid(user),created_by_name=name(user)))
    session.flush()

def new_row(project,source,user,review_id,version,parent=None):
    proposal=json.loads(source.input_manifest).get('human_proposal',{})
    return EAHumanReview(id=review_id,project_id=project.id,version=version,status='Draft',
        source_review_id=source.id,source_input_digest=source.input_digest,source_text_sha256=sha(source.review_text),
        parent_review_id=parent.id if parent else None,review_text=source.review_text,
        technology_stack=', '.join(proposal.get('technologies',[])),technology_rationale=proposal.get('rationale',''),
        decision_rationale='',conditions='',created_by=ai.oid(user),created_by_name=name(user),
        updated_by=ai.oid(user),updated_by_name=name(user))

def get_state(session,demand_id,user):
    project,permissions=access(session,demand_id,user)
    rows=all_reviews(session,project)
    latest=rows[-1] if rows else None
    events=list(session.scalars(select(EAHumanReviewEvent).where(EAHumanReviewEvent.project_id==project.id)
        .order_by(EAHumanReviewEvent.created_at,EAHumanReviewEvent.id)))
    source,stale=changed(session,project,latest) if latest else (None,False)
    return dict(projectRevision=project.revision,eaStatus=project.ea_status,eaComplexity=project.ea_complexity,
        canEdit=permissions[1] and (not latest or latest.status=='Draft'),
        canSubmit=permissions[1] and bool(latest and latest.status=='Draft') and not stale,
        canReopen=permissions[1] and bool(latest and latest.status=='Submitted'),
        currentReview=view(latest) if latest else None,sourceChanged=stale,
        sourceReview=ai.review_view(source) if source else None,
        history=[view(row) for row in rows],
        events=[dict(id=str(e.id),reviewId=str(e.review_id),revision=e.review_revision,action=e.action,
            reason=e.reason,createdAt=ai.iso(e.created_at),createdBy=e.created_by_name) for e in events])

def get_version(session,demand_id,review_id,user):
    project,_=access(session,demand_id,user)
    row=owned(session,project,review_id)
    events=list(session.scalars(select(EAHumanReviewEvent).where(EAHumanReviewEvent.review_id==row.id)
        .order_by(EAHumanReviewEvent.created_at,EAHumanReviewEvent.id)))
    return dict(review=view(row),snapshots=[dict(id=str(e.id),action=e.action,reason=e.reason,
        recordedAt=ai.iso(e.created_at),recordedBy=e.created_by_name,review=json.loads(e.payload)) for e in events])

def create(session,demand_id,review_id,data,user):
    with ai.tx(session):
        project,_=access(session,demand_id,user,write=True)
        digest=intent('Create',review_id,data)
        prior=replay(session,project,review_id,digest,user)
        if prior:return view(prior)
        project_revision(project,data.expected_project_revision)
        rows=all_reviews(session,project);latest=rows[-1] if rows else None
        if latest:
            if latest.id!=data.expected_current_review_id or latest.revision!=data.expected_current_revision:
                raise HTTPException(409,'Human review changed. Reload before creating a replacement.')
            if latest.status!='Draft' or not data.replace_draft:
                raise HTTPException(409,'Explicitly replace the current draft, or reopen a submitted review.')
        elif data.expected_current_review_id is not None:
            raise HTTPException(409,'No current human review matches the supplied revision.')
        source,stale=source_state(session,project,data.source_review_id)
        if stale:raise HTTPException(409,'Use the current accepted AI review with unchanged evidence.')
        if session.get(EAHumanReview,review_id):raise HTTPException(409,'Human review ID already used.')
        row=new_row(project,source,user,review_id,len(rows)+1,latest)
        if latest:
            latest.status='Superseded';latest.updated_at=utc_now()
            latest.updated_by=ai.oid(user);latest.updated_by_name=name(user)
        session.add(row);audit(session,project,row,review_id,'Replace' if latest else 'Create',digest,user)
        return view(row)

def save(session,demand_id,review_id,request_id,data,user):
    with ai.tx(session):
        project,_=access(session,demand_id,user,write=True)
        row=owned(session,project,review_id)
        digest=intent('Save',review_id,data)
        prior=replay(session,project,request_id,digest,user)
        if prior:return view(prior)
        current(session,project,row,data.expected_revision)
        diagram=None
        if data.diagram_id:
            diagram=session.get(EAArchitectureDiagram,data.diagram_id)
            if not diagram or diagram.project_id!=project.id or diagram.status!='Ready':
                raise HTTPException(422,'Select a saved diagram from this project.')
        architecture_changed = any(getattr(row, field) != getattr(data, field)
                                   for field in ARCHITECTURE_FIELDS)
        for field in FIELDS:setattr(row,field,getattr(data,field))
        if architecture_changed:
            row.diagram_confirmed = False
        row.diagram_file_name=diagram.file_name if diagram else '' 
        row.updated_at=utc_now();row.updated_by=ai.oid(user);row.updated_by_name=name(user)
        audit(session,project,row,request_id,'Save',digest,user)
        return view(row)

def submit(session,demand_id,review_id,request_id,data,user):
    with ai.tx(session):
        project,_=access(session,demand_id,user,write=True)
        row=owned(session,project,review_id);digest=intent('Submit',review_id,data)
        prior=replay(session,project,request_id,digest,user)
        if prior:return view(prior)
        project_revision(project,data.expected_project_revision)
        current(session,project,row,data.expected_revision)
        _,stale=changed(session,project,row)
        if stale:raise HTTPException(409,'AI source or evidence changed. Review the current accepted source before submission.')
        if not row.complexity or not row.decision or not row.decision_rationale.strip():
            raise HTTPException(422,'Select human complexity and decision and explain the decision.')
        if row.decision in ['Approved','Conditional approval'] and (not row.technology_stack.strip() or not row.technology_rationale.strip()):
            raise HTTPException(422,'Approval requires a final technology stack and rationale.')
        if row.decision=='Conditional approval' and not row.conditions.strip():
            raise HTTPException(422,'Conditional approval requires conditions and outstanding work.')
        if row.decision in ['Approved','Conditional approval']:
            if row.diagram_requirement=='Not applicable':
                if not row.diagram_justification.strip():
                    raise HTTPException(422,'Explain why an architecture diagram is not applicable.')
            elif row.diagram_requirement=='Pending':
                if row.decision!='Conditional approval' or not row.diagram_justification.strip() or not row.diagram_owner.strip() or not row.diagram_due_date:
                    raise HTTPException(422,'A pending diagram requires conditional approval, a reason, owner and due date.')
            else:
                diagram=session.get(EAArchitectureDiagram,row.diagram_id) if row.diagram_id else None
                if not diagram or diagram.project_id!=project.id or diagram.status!='Ready' or not row.diagram_confirmed:
                    raise HTTPException(422,'Approval requires a saved architecture diagram confirmed by the human EA.')
        row.status='Submitted';row.submitted_at=utc_now();row.submitted_by=ai.oid(user);row.submitted_by_name=name(user)
        row.updated_at=row.submitted_at;row.updated_by=ai.oid(user);row.updated_by_name=name(user)
        project.ea_status=row.decision;project.ea_complexity=row.complexity;project.updated_at=utc_now()
        audit(session,project,row,request_id,'Submit',digest,user)
        return view(row)

def reopen(session,demand_id,review_id,request_id,data,user):
    with ai.tx(session):
        project,_=access(session,demand_id,user,write=True)
        row=owned(session,project,review_id);digest=intent('Reopen',review_id,data)
        prior=replay(session,project,request_id,digest,user)
        if prior:return view(prior)
        project_revision(project,data.expected_project_revision)
        current(session,project,row,data.expected_revision,status='Submitted')
        # Copy human fields, never regenerate from AI or mutate the submitted version.
        draft=EAHumanReview(id=uuid4(),project_id=project.id,version=row.version+1,status='Draft',
            source_review_id=row.source_review_id,source_input_digest=row.source_input_digest,
            source_text_sha256=row.source_text_sha256,parent_review_id=row.id,diagram_file_name=row.diagram_file_name,
            **{field:(False if field=='diagram_confirmed' else getattr(row,field)) for field in FIELDS},created_by=ai.oid(user),created_by_name=name(user),
            updated_by=ai.oid(user),updated_by_name=name(user))
        session.add(draft)
        project.ea_status='Pending';project.ea_complexity='Not assessed';project.updated_at=utc_now()
        audit(session,project,draft,request_id,'Reopen',digest,user,reason=data.reason)
        return view(draft)
