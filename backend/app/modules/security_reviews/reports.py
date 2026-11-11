"""Private, project-scoped PDF closing reports."""
import hashlib
import json
import logging

from azure.core.exceptions import AzureError
from fastapi import HTTPException

from app.db.models import SecurityReviewVersion
from app.modules.artifacts.service import MAX_BYTES, filename
from .service import access, append, latest, revision, view

logger = logging.getLogger(__name__)


def preflight(session, demand_id, user):
    try:
        access(session, demand_id, user)
    finally:
        session.rollback()


def matching_file(session, project, report_id, name, digest, user, kind):
    row = session.get(SecurityReviewVersion, report_id)
    if row is None:
        return None
    if row.project_id != project.id or row.kind != kind or row.author_id != str(user.get('objectId', '')):
        raise HTTPException(409, 'This upload ID is already in use.')
    details = json.loads(row.payload)
    if details['fileName'] != name or details['sha256'] != digest:
        raise HTTPException(409, 'This upload ID belongs to a different file.')
    return row


def upload(session, demand_id, report_id, name, content, user, store):
    filename(name)
    if not name.lower().endswith('.pdf') or not content.startswith(b'%PDF-'):
        raise HTTPException(422, 'Attach a PDF Security closing report.')
    if len(content) > MAX_BYTES:
        raise HTTPException(413, 'Closing reports can be up to 20 MB.')
    return save_file(session, demand_id, report_id, name, content, user, store, 'Report',
                     'closing-reports', 'pdf')


def save_file(session, demand_id, report_id, name, content, user, store, kind, folder, extension):
    digest = hashlib.sha256(content).hexdigest()
    project, _ = access(session, demand_id, user)
    prior = matching_file(session, project, report_id, name, digest, user, kind)
    if prior:
        return view(prior)
    blob = f'{project.demand_id}/security/{folder}/{report_id}.{extension}'
    session.rollback()
    store.validate()
    try:
        store.put(store.container, blob, content, digest)
    except AzureError as error:
        logger.warning('Security file upload failed; exception_type=%s', type(error).__name__)
        raise HTTPException(503, 'Security file upload failed. Retry the same file.') from None
    with session.begin():
        project, _ = access(session, demand_id, user, lock=True)
        prior = matching_file(session, project, report_id, name, digest, user, kind)
        if prior:
            return view(prior)
        return append(session, project, revision(latest(session, project.id)), kind, {
            'fileName': name, 'sha256': digest, 'sizeBytes': len(content),
            'account': store.account, 'container': store.container, 'blob': blob,
        }, user, event_id=report_id)


def download(session, demand_id, report_id, user, store, kind='Report'):
    project, _ = access(session, demand_id, user)
    report = session.get(SecurityReviewVersion, report_id)
    if not report or report.project_id != project.id or report.kind != kind:
        raise HTTPException(404, 'Security file not found.')
    details = json.loads(report.payload)
    session.rollback()
    return details['fileName'], read_blob(details, store)


def read_blob(details, store):
    if details['account'] != store.account:
        raise HTTPException(503, 'The configured storage account differs from the report account.')
    try:
        return store.get(details['container'], details['blob'],
            details['sizeBytes'], details['sha256'])
    except AzureError as error:
        logger.warning('Security file download failed; exception_type=%s', type(error).__name__)
        raise HTTPException(503, 'Security file could not be downloaded.') from None
