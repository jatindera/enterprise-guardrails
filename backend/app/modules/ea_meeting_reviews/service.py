"""EA meeting history. SQL owns state; Blob owns originals; AI drafts never approve."""
import hashlib
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import PurePath
from uuid import UUID, uuid4
from fastapi import HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from azure.core.exceptions import AzureError
from app.db.models import (Project, EAReviewMeeting, EAMeetingTranscript, EAMeetingReview,
    utc_now)
from app.modules.projects.ea_access import ea_permissions
from app.modules.meetings.router import find_project
from app.modules.intake.service import get_context
from app.agents.enterprise_architecture.context import EAProjectContext, preparation_input
from app.agents.enterprise_architecture.profiles import MEETING_REVIEW
from app.modules.ea_preparation.execution import EAExecutionSettings
from app.modules.ea_preparation.hosted import HostedEASettings
from .schemas import ReviewResult
from .validation import align_citation, CitationError, unwrap_json
from app.modules.ea_preparation.errors import EAInferenceError

logger = logging.getLogger(__name__)
MAX_FILE = 2 * 1024 * 1024
MAX_TOTAL = 10 * 1024 * 1024

class ReviewSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='APP_EA_REVIEW_', extra='ignore')
    max_input_chars: int = 60000


def oid(user): return str(user.get('objectId', ''))[:128]
def iso(value):
    if value is None: return None
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()

@contextmanager
def tx(session):
    try:
        with session.begin(): yield
    except (StaleDataError, IntegrityError):
        session.rollback()
        raise HTTPException(409, 'Meeting changed while saving. Reload and try again.') from None


def project_access(session, demand_id, user, edit=False, accept=False, lock=False):
    project = find_project(session, demand_id, locked=lock)
    permissions = ea_permissions(user, project.assigned_ea_object_id, project.additional_ea_object_id)
    if (edit and not permissions[0]) or (accept and not permissions[1]):
        raise HTTPException(403, 'Only assigned EA reviewers or Admin may edit; only primary EA or Admin may accept a review.')
    return project, permissions


def meeting_for(session, project, meeting_id):
    meeting = session.scalar(select(EAReviewMeeting).where(EAReviewMeeting.id == meeting_id, EAReviewMeeting.project_id == project.id))
    if not meeting: raise HTTPException(404, 'Meeting not found.')
    return meeting


def active_reviews(session, meeting):
    return list(session.scalars(select(EAMeetingReview).where(EAMeetingReview.meeting_id == meeting.id).order_by(EAMeetingReview.version)))


def check_open(session, meeting, expected=None):
    if meeting.state != 'Open': raise HTTPException(409, 'Accepted meetings are read-only. Start the next meeting.')
    if expected is not None and meeting.revision != expected: raise HTTPException(409, 'Meeting changed. Reload before continuing.')
    if any(r.status == 'Generating' for r in active_reviews(session, meeting)):
        raise HTTPException(409, 'A review is already generating. Refresh for its result or recover it after ten minutes.')


def touch(session, meeting):
    meeting.updated_at = utc_now()
    session.flush()


def review_view(row):
    return dict(id=str(row.id), version=row.version, status=row.status, text=row.review_text,
        basisReviewId=str(row.basis_review_id) if row.basis_review_id else None,
        parentReviewId=str(row.parent_review_id) if row.parent_review_id else None,
        createdAt=iso(row.created_at), createdBy=row.created_by, acceptedAt=iso(row.accepted_at),
        acceptedBy=row.accepted_by_name, profileVersion=row.profile_version,
        canRecover=row.status == 'Generating' and datetime.now(timezone.utc) -
        (row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at) > timedelta(minutes=10))


def transcript_view(row):
    return dict(id=str(row.id), fileName=row.file_name, sizeBytes=row.size_bytes, sha256=row.sha256,
        status=row.status, uploadedAt=iso(row.uploaded_at))


def meeting_view(row):
    return dict(id=str(row.id), number=row.number, title=row.title, state=row.state,
        revision=row.revision, createdAt=iso(row.created_at))


def detail(session, project, meeting, permissions):
    files = session.scalars(select(EAMeetingTranscript).where(EAMeetingTranscript.meeting_id == meeting.id,
        EAMeetingTranscript.status.in_(['Ready', 'Pending', 'Deleting', 'Removed', 'Cancelled'])).order_by(EAMeetingTranscript.uploaded_at, EAMeetingTranscript.id))
    return dict(**meeting_view(meeting), canEdit=permissions[0] and meeting.state == 'Open',
        canAccept=permissions[1] and meeting.state == 'Open', transcripts=[transcript_view(f) for f in files],
        reviews=[review_view(r) for r in active_reviews(session, meeting)])


def latest_accepted(session, project, before=None):
    stmt = select(EAMeetingReview).join(EAReviewMeeting, EAMeetingReview.meeting_id == EAReviewMeeting.id).where(
        EAReviewMeeting.project_id == project.id, EAMeetingReview.status == 'Accepted')
    if before is not None: stmt = stmt.where(EAReviewMeeting.number < before)
    return session.scalar(stmt.order_by(EAReviewMeeting.number.desc(), EAMeetingReview.version.desc()))


def list_meetings(session, demand_id, user):
    project, permissions = project_access(session, demand_id, user)
    meetings = list(session.scalars(select(EAReviewMeeting).where(EAReviewMeeting.project_id == project.id).order_by(EAReviewMeeting.number)))
    accepted = latest_accepted(session, project)
    return dict(meetings=[meeting_view(m) for m in meetings], canEdit=permissions[0],
        latestAcceptedReview=review_view(accepted) if accepted else None)


def create_meeting(session, demand_id, user, title):
    with tx(session):
        project, permissions = project_access(session, demand_id, user, edit=True, lock=True)
        last = session.scalar(select(EAReviewMeeting).where(EAReviewMeeting.project_id == project.id).order_by(EAReviewMeeting.number.desc()))
        # Idempotent recovery when a create response is lost: never create two open rounds.
        if last and last.state == 'Open': return detail(session, project, last, permissions)
        number = last.number + 1 if last else 1
        meeting = EAReviewMeeting(project_id=project.id, number=number,
            title=title.strip() or f'Meeting {number}', created_by=oid(user))
        session.add(meeting); session.flush()
        return detail(session, project, meeting, permissions)


def valid_filename(name):
    if (not name or name != name.strip() or len(name.encode('utf-16-le'))//2 > 260
        or any(c in name for c in '/\\') or any(ord(c)<32 or ord(c)==127 for c in name)
        or PurePath(name).suffix.lower() not in ['.txt','.vtt','.md']):
        raise HTTPException(422, 'Use a .txt, .vtt or .md filename without paths or control characters.')
    return name


def decode(data):
    try: text = data.decode('utf-8-sig')
    except UnicodeDecodeError: raise HTTPException(422, 'Save the transcript as UTF-8 text before uploading.') from None
    if not text.strip() or '\x00' in text: raise HTTPException(422, 'Transcript must contain nonempty text.')
    return text


def preflight(session, demand_id, meeting_id, user):
    try:
        p, _ = project_access(session, demand_id, user, edit=True)
        check_open(session, meeting_for(session, p, meeting_id))
    finally: session.rollback()


def upload(session, demand_id, meeting_id, upload_id, name, data, user, store):
    valid_filename(name)
    if not data or len(data)>MAX_FILE: raise HTTPException(413, 'Transcript must be nonempty and at most 2 MB.')
    decode(data); digest = hashlib.sha256(data).hexdigest(); store.validate()
    with tx(session):
        project, _ = project_access(session, demand_id, user, edit=True, lock=True)
        meeting = meeting_for(session, project, meeting_id)
        existing = session.get(EAMeetingTranscript, upload_id)
        if existing:
            if (existing.meeting_id != meeting.id or existing.uploaded_by != oid(user) or
                existing.file_name != name or existing.sha256 != digest):
                raise HTTPException(409, 'Upload ID belongs to another file or uploader.')
            if existing.status == 'Ready': return transcript_view(existing)
            if existing.status != 'Pending': raise HTTPException(409, 'Upload was removed. Select the file again.')
            if existing.storage_account != store.account: raise HTTPException(409, 'Storage account changed. Start a new upload.')
        check_open(session, meeting)
        rows = list(session.scalars(select(EAMeetingTranscript).where(EAMeetingTranscript.meeting_id == meeting.id,
            EAMeetingTranscript.status.in_(['Pending','Ready']))))
        if not existing:
            if len(rows)>=10 or sum(f.size_bytes for f in rows)+len(data)>MAX_TOTAL:
                raise HTTPException(413, 'Maximum 10 transcripts and 10 MB combined per meeting.')
            if any(f.sha256 == digest and f.file_name == name for f in rows): raise HTTPException(409, 'This transcript is already attached.')
            existing = EAMeetingTranscript(id=upload_id, meeting_id=meeting.id, file_name=name, size_bytes=len(data), sha256=digest,
                storage_account=store.account, container=store.container,
                blob_name=f'{project.demand_id}/ea/meetings/{meeting.id}/transcripts/{upload_id}/{PurePath(name).suffix[1:].lower()}',
                uploaded_by=oid(user), status='Pending')
            session.add(existing); touch(session, meeting)
        container, blob_name = existing.container, existing.blob_name
    try: store.put(container, blob_name, data, digest)
    except AzureError:
        logger.warning('EA transcript storage failed; upload_id=%s', upload_id)
        raise HTTPException(503, 'Transcript upload failed. Retry the same file or cancel its pending entry.') from None
    with tx(session):
        project, _ = project_access(session, demand_id, user, edit=True, lock=True)
        meeting = meeting_for(session, project, meeting_id)
        existing = session.get(EAMeetingTranscript, upload_id)
        cancelled = not existing or existing.status not in ['Pending', 'Ready']
        if cancelled:
            # A DELETE may finish before an in-flight PUT. Remove that late
            # write as well, and never recreate the deleted metadata.
            try:
                store.delete(container, blob_name)
            except AzureError:
                logger.warning('EA cancelled upload cleanup failed; upload_id=%s', upload_id)
                # Keep a retryable row if deletion already removed its metadata.
                if not existing:
                    session.add(EAMeetingTranscript(id=upload_id, meeting_id=meeting.id,
                        file_name=name, size_bytes=len(data), sha256=digest,
                        storage_account=store.account, container=container, blob_name=blob_name,
                        uploaded_by=oid(user), status='Deleting'))
                    touch(session, meeting)
                else:
                    existing.status='Deleting'
                    touch(session, meeting)
        else:
            check_open(session, meeting)
            if existing.status == 'Pending':
                existing.status='Ready'; existing.uploaded_at=utc_now(); touch(session, meeting)
        result = transcript_view(existing) if not cancelled else None
    if cancelled: raise HTTPException(409, 'Upload was deleted while uploading. Refresh saved data.')
    return result


def remove(session, demand_id, meeting_id, file_id, user, store):
    # Commit exclusion before contacting Blob. Failed deletion stays visible and
    # retryable, and neither generation nor acceptance can use this evidence.
    with tx(session):
        project, _ = project_access(session, demand_id, user, edit=True, lock=True)
        meeting = meeting_for(session, project, meeting_id); check_open(session, meeting)
        row = session.get(EAMeetingTranscript, file_id)
        if not row: return  # Lost successful response: retry is idempotent.
        if row.meeting_id != meeting.id: raise HTTPException(404, 'Transcript not found.')
        if row.storage_account != store.account:
            raise HTTPException(503, 'Configured storage account differs from this transcript.')
        container, blob_name = row.container, row.blob_name
        row.status = 'Deleting'
        touch(session, meeting)
    try:
        store.delete(container, blob_name)
    except AzureError:
        logger.warning('EA transcript deletion failed; file_id=%s', file_id)
        raise HTTPException(503, 'Storage deletion failed. This transcript is excluded from AI. Retry deletion.') from None
    # If SQL commit fails, the Deleting row survives for a safe retry; do not
    # report success until both systems have completed deletion.
    with tx(session):
        project, _ = project_access(session, demand_id, user, edit=True, lock=True)
        meeting = meeting_for(session, project, meeting_id); check_open(session, meeting)
        row = session.get(EAMeetingTranscript, file_id)
        if row:
            if row.meeting_id != meeting.id: raise HTTPException(404, 'Transcript not found.')
            session.delete(row)
            touch(session, meeting)


def download(session, demand_id, meeting_id, file_id, user, store):
    project, _ = project_access(session, demand_id, user)
    meeting = meeting_for(session, project, meeting_id)
    row = session.get(EAMeetingTranscript, file_id)
    if not row or row.meeting_id != meeting.id or row.status not in ['Ready','Removed']:
        raise HTTPException(404, 'Transcript not found.')
    if row.storage_account != store.account: raise HTTPException(503, 'Configured storage account differs from this transcript.')
    name, container, blob, size, digest = row.file_name, row.container, row.blob_name, row.size_bytes, row.sha256
    session.rollback()
    try: return name, store.get(container, blob, size, digest)
    except AzureError:
        raise HTTPException(503, 'Transcript could not be downloaded. Check storage access.') from None


def snapshot(session, project, meeting):
    files = list(session.scalars(select(EAMeetingTranscript).where(EAMeetingTranscript.meeting_id == meeting.id,
        EAMeetingTranscript.status == 'Ready').order_by(EAMeetingTranscript.uploaded_at, EAMeetingTranscript.id)))
    ctx = EAProjectContext(demand_id=project.demand_id, project_name=project.name,
        business_function=project.business_function, intake=get_context(session, project.demand_id))
    context = json.loads(preparation_input(ctx, 'review'))['project_context']
    manifest = dict(context_version='transcripts_only_v1', project_context=context,
        transcripts=[dict(id=str(f.id), file_name=f.file_name, sha256=f.sha256) for f in files])
    encoded = json.dumps(manifest, sort_keys=True, ensure_ascii=False)
    return manifest, hashlib.sha256(encoded.encode()).hexdigest(), files


def numbered(text): return [{'line':i+1, 'text':line} for i,line in enumerate(text.splitlines())]


def render(result, labels):
    chunks = ['Consolidated meeting review', result.summary]
    for f in result.findings:
        chunks.append(f.kind.replace('_',' ').title() + ': ' + f.text)
        if f.question: chunks.append('Question: '+f.question)
        if f.answer: chunks.append('Stakeholder-reported answer: '+f.answer)
        for c in f.citations:
            chunks.append(f'  Source: {labels[(c.kind,str(c.id))]} | line {c.line}: "{c.quote}"')
    if result.follow_up_questions: chunks.extend(['Next meeting questions']+['- '+q for q in result.follow_up_questions])
    text='\n\n'.join(chunks)
    if len(text)>16000: raise ValueError('Review output too large.')
    return text


def generate(session, demand_id, meeting_id, review_id, expected, user, store, invoke):
    with tx(session):
        project, _ = project_access(session, demand_id, user, edit=True, lock=True)
        meeting = meeting_for(session, project, meeting_id)
        prior = session.get(EAMeetingReview, review_id)
        if prior:
            if prior.meeting_id != meeting.id or prior.created_by != oid(user): raise HTTPException(409, 'Review request ID is already used.')
            return review_view(prior)
        check_open(session, meeting, expected)
        if session.scalar(select(EAMeetingTranscript.id).where(EAMeetingTranscript.meeting_id == meeting.id, EAMeetingTranscript.status.in_(['Pending', 'Deleting']))):
            raise HTTPException(409, 'Finish pending uploads or retry transcript deletions before generating.')
        manifest, digest, files = snapshot(session, project, meeting)
        if not files: raise HTTPException(422, 'Upload a transcript for this meeting first.')
        mode = EAExecutionSettings().execution_mode
        reference = 'local' if mode == 'local' else f'{HostedEASettings().agent_name}:{HostedEASettings().agent_version}'
        reviews=active_reviews(session, meeting)
        row=EAMeetingReview(id=review_id, meeting_id=meeting.id, version=max((r.version for r in reviews),default=0)+1,
            status='Generating', basis_review_id=None, input_digest=digest,
            input_manifest=json.dumps(manifest,ensure_ascii=False), created_by=oid(user),
            profile_version=MEETING_REVIEW.version, execution_mode=mode, agent_reference=reference)
        session.add(row); touch(session,meeting)
        # Capture primitive metadata before releasing the DB connection.
        file_info=[(str(f.id),f.file_name,f.container,f.blob_name,f.size_bytes,f.sha256,f.storage_account) for f in files]
    stage='storage'; output_chars=0
    try:
        sources={}; labels={}; transcripts=[]
        budget=max(4000,min(ReviewSettings().max_input_chars,200000))
        decoded_chars=0
        for fid,name,container,blob,size,digest,account in file_info:
            if account != store.account: raise HTTPException(503,'Storage account changed.')
            text=decode(store.get(container,blob,size,digest))
            decoded_chars+=len(text)
            if decoded_chars>budget:
                raise HTTPException(422,'Transcript text exceeds APP_EA_REVIEW_MAX_INPUT_CHARS. Narrow the input or adjust the budget; no text was truncated.')
            sources[('transcript',fid)]=text.splitlines(); labels[('transcript',fid)]=name
            transcripts.append(dict(id=fid,file_name=name,lines=numbered(text)))
        stage='input'
        payload=json.dumps(dict(task=MEETING_REVIEW.instructions, project_context=manifest['project_context'],
            transcripts=transcripts),ensure_ascii=False)
        if len(payload)>budget:
            raise HTTPException(422,'Review input exceeds its configured budget. Narrow the transcripts or increase APP_EA_REVIEW_MAX_INPUT_CHARS deliberately; no content was truncated.')
        stage='inference'
        raw=invoke(payload)
        output_chars=len(raw)
        stage='json'
        result=ReviewResult.model_validate_json(unwrap_json(raw))
        stage='citations'; realigned=0
        for finding in result.findings:
            if finding.prepared_question_id is not None: raise CitationError('unknown_question')
            for cite in finding.citations:
                realigned += int(align_citation(cite,sources))
        if realigned:
            logger.info('ea_review_citations_aligned review_id=%s count=%s', review_id, realigned)
        stage='render'
        text=render(result,labels)
        stage='save'
        with tx(session):
            project,_=project_access(session,demand_id,user,edit=True,lock=True)
            meeting=meeting_for(session,project,meeting_id)
            row=session.get(EAMeetingReview,review_id)
            if meeting.state!='Open' or row.status!='Generating': raise HTTPException(409,'Review request is no longer active.')
            _,current_digest,_=snapshot(session,project,meeting)
            if current_digest!=row.input_digest: raise HTTPException(409,'Inputs changed during generation. Generate again.')
            row.status='Draft'; row.ai_result=result.model_dump_json(); row.review_text=text
            touch(session,meeting)
            return review_view(row)
    except Exception as exc:
        session.rollback()
        with tx(session):
            failed=session.get(EAMeetingReview,review_id)
            if failed and failed.status=='Generating':
                failed.status='Failed'; touch(session,session.get(EAReviewMeeting,meeting_id))
        if isinstance(exc,HTTPException): raise
        if isinstance(exc,CitationError):
            code=exc.code
            message='AI source validation failed. A quote or source reference could not be verified. No review was accepted.'
        elif isinstance(exc,EAInferenceError):
            code=exc.code
            message=('The model reached its output limit before completing the review.' if code=='output_limit' else
                'The model returned an incomplete, empty or filtered response.')
        elif isinstance(exc,ValidationError):
            code='invalid_json' if any(e['type']=='json_invalid' for e in exc.errors()) else 'invalid_schema'
            message='The model returned invalid or incomplete review JSON.' if code=='invalid_json' else 'The model response did not match the review schema.'
        elif isinstance(exc,AzureError):
            code='storage_read' if stage=='storage' else 'provider_error'
            message='Could not read the saved transcript from storage.' if stage=='storage' else 'Azure could not complete the AI request. Check model access and execution configuration.'
        else:
            code='inference_error' if stage=='inference' else 'review_error'
            message='Could not complete AI inference. Check execution mode, model access and deployment.' if stage=='inference' else 'Could not complete the meeting review.'
        fields=[{'type':e['type'],'loc':list(e['loc'])} for e in exc.errors()] if isinstance(exc,ValidationError) else []
        logger.warning(json.dumps(dict(event='ea_review_failed',review_id=str(review_id),stage=stage,
            code=code,exception_type=type(exc).__name__,output_chars=output_chars,validation_fields=fields)))
        raise HTTPException(502,f'{message} [{code}; reference {review_id}]') from None



def edit_review(session,demand_id,meeting_id,review_id,data,user):
    with tx(session):
        project,_=project_access(session,demand_id,user,edit=True,lock=True)
        meeting=meeting_for(session,project,meeting_id)
        prior=session.get(EAMeetingReview,review_id)
        if prior:
            if prior.meeting_id!=meeting.id or prior.created_by!=oid(user) or prior.review_text!=data.text.strip(): raise HTTPException(409,'Review ID already used.')
            return review_view(prior)
        check_open(session,meeting,data.expected_revision)
        reviews=active_reviews(session,meeting)
        successful=[r for r in reviews if r.status in ['Draft','Accepted']]
        parent=successful[-1] if successful else None
        if not parent or parent.id!=data.parent_review_id: raise HTTPException(409,'Edit the latest saved draft.')
        if not data.text.strip(): raise HTTPException(422,'Review must not be blank.')
        row=EAMeetingReview(id=review_id,meeting_id=meeting.id,version=max(r.version for r in reviews)+1,status='Draft',
            basis_review_id=parent.basis_review_id,parent_review_id=parent.id,input_digest=parent.input_digest,input_manifest=parent.input_manifest,
            ai_result=parent.ai_result,review_text=data.text.strip(),profile_version=parent.profile_version,
            execution_mode=parent.execution_mode,agent_reference=parent.agent_reference,created_by=oid(user))
        session.add(row); touch(session,meeting)
        return review_view(row)


def accept_review(session,demand_id,meeting_id,review_id,expected,user):
    with tx(session):
        project,_=project_access(session,demand_id,user,accept=True,lock=True)
        meeting=meeting_for(session,project,meeting_id)
        row=session.get(EAMeetingReview,review_id)
        if not row or row.meeting_id!=meeting.id: raise HTTPException(404,'Review not found.')
        if row.status=='Accepted': return review_view(row)
        check_open(session,meeting,expected)
        successful=[r for r in active_reviews(session,meeting) if r.status in ['Draft','Accepted']]
        if not successful or successful[-1].id!=review_id: raise HTTPException(409,'Only the latest saved draft can be accepted.')
        if session.scalar(select(EAMeetingTranscript.id).where(EAMeetingTranscript.meeting_id == meeting.id, EAMeetingTranscript.status.in_(['Pending', 'Deleting']))):
            raise HTTPException(409,'Finish pending uploads or retry transcript deletions before acceptance.')
        _,digest,_=snapshot(session,project,meeting)
        if digest!=row.input_digest: raise HTTPException(409,'Meeting evidence or project context changed. Regenerate before acceptance.')
        row.status='Accepted'; row.accepted_at=utc_now(); row.accepted_by=oid(user)
        row.accepted_by_name=str(user.get('name') or user.get('username') or 'Reviewer')[:200]
        meeting.state='Accepted'; touch(session,meeting)
        return review_view(row)


def recover(session,demand_id,meeting_id,review_id,user):
    with tx(session):
        project,_=project_access(session,demand_id,user,edit=True,lock=True)
        meeting=meeting_for(session,project,meeting_id)
        row=session.get(EAMeetingReview,review_id)
        if not row or row.meeting_id!=meeting.id: raise HTTPException(404,'Review not found.')
        if not review_view(row)['canRecover']: raise HTTPException(409,'Only generating requests older than ten minutes can be recovered.')
        row.status='Failed'; touch(session,meeting)
