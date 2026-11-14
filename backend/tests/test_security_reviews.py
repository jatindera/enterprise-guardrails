import json

import pytest
from unittest.mock import Mock
from uuid import uuid4

from app.core.auth import current_user
from app.modules.artifacts.storage import artifact_store
from app.modules.security_preparation.router import security_invoker
from test_project_api import client, database, payload
from test_security_preparation import PRIMARY, ADDITIONAL, security_project

BASE = '/api/projects/3601/security-reviews'
SOURCE = {'fileName': 'meeting.txt', 'text': 'Vendor access expires after one day.'}
AI = {'summary': 'Vendor access was discussed.', 'readiness': 'Ready for human assessment',
      'readinessReason': 'Controls and verification are documented.', 'findings': [
    {'kind': 'Reported control', 'text': 'Vendor access is time limited.', 'transcript': 1, 'line': 1},
]}
HUMAN = {'risk': 'Medium', 'decision': 'Conditional approval',
         'assessment': 'Human assessment of vendor access.', 'rationale': 'Verify access removal.', 'conditions': 'Test revocation.'}


class MemoryStore:
    account = 'testaccount'
    container = 'private'

    def __init__(self):
        self.data = {}

    def validate(self):
        pass

    def put(self, container, name, content, digest):
        self.data[container, name] = content, digest

    def delete(self, container, name):
        self.data.pop((container, name), None)

    def get(self, container, name, size, digest):
        content, stored = self.data[container, name]
        assert stored == digest and len(content) == size
        return content


@pytest.fixture
def saved_transcript(client, security_project):
    store = MemoryStore()
    client.app.dependency_overrides[artifact_store] = lambda: store
    file_id = str(uuid4())
    url = f'{BASE}/transcripts/{file_id}?fileName=meeting.txt'
    response = client.put(url, content=SOURCE['text'].encode())
    assert response.status_code == 200, response.text
    assert client.put(url, content=SOURCE['text'].encode()).json() == response.json()
    assert len(store.data) == 1
    assert client.get(f'{BASE}/transcripts/{file_id}/download').content == SOURCE['text'].encode()
    assert client.get(BASE).json()['transcripts'][0]['id'] == file_id
    return file_id, store


def generate(client, saved_transcript, expected=1, review=AI):
    invoke = Mock(return_value=json.dumps(review))
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    result = client.post(BASE + '/generate', json={
        'expectedRevision': expected, 'transcriptIds': [saved_transcript[0]],
    })
    return result, invoke


def test_security_review_lifecycle_persists_source_and_submitted_history(client, saved_transcript):
    assert client.put(BASE + '/human', json={'expectedRevision': 1, **HUMAN}).status_code == 409
    ai, invoke = generate(client, saved_transcript)
    assert ai.status_code == 200, ai.text
    assert SOURCE['text'] in invoke.call_args.args[0]
    assert ai.json()['data']['findings'][0]['excerpt'] == SOURCE['text']
    assert 'text' not in ai.json()['data']['sources'][0]
    assert ai.json()['data']['templateVersion'] == '2.0'
    assert ai.json()['data']['readiness'] == 'Ready for human assessment'
    assert client.get(BASE + '/ai/2/transcripts/1/download').content == SOURCE['text'].encode()
    assert client.post(BASE + '/accept', json={'expectedRevision': 2}).status_code == 200
    assert client.put(BASE + '/human', json={'expectedRevision': 2, **HUMAN}).status_code == 409
    saved = client.put(BASE + '/human', json={'expectedRevision': 3, **HUMAN})
    assert saved.status_code == 200, saved.text
    changed = {**HUMAN, 'rationale': 'Unreviewed edit'}
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 4, **changed}).status_code == 409
    submitted = client.post(BASE + '/human/submit', json={'expectedRevision': 4, **HUMAN})
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()['sourceRevision'] == 2
    assert client.put(BASE + '/human', json={'expectedRevision': 5, **HUMAN}).status_code == 409
    assert client.post(BASE + '/human/reopen', json={'expectedRevision': 5, 'reason': 'New evidence'}).status_code == 200
    state = client.get(BASE).json()
    assert state['human']['kind'] == 'Draft'
    assert state['history'] == [submitted.json()]
    assert state['history'][0]['data']['assessment'] == HUMAN['assessment']


def test_invalid_citations_and_unauthorized_review_calls(client, saved_transcript):
    invalid = {**AI, 'findings': [{**AI['findings'][0], 'line': 99}]}
    failed, _ = generate(client, saved_transcript, review=invalid)
    assert failed.status_code == 502
    assert client.get(BASE).json()['revision'] == 1
    client.app.dependency_overrides[current_user] = lambda: {'objectId': str(uuid4()), 'roles': ['security-engineer']}
    denied, invoke = generate(client, saved_transcript)
    assert denied.status_code == 403
    assert client.get(BASE).status_code == 403
    invoke.assert_not_called()


def test_only_primary_security_reviewer_can_submit(client, saved_transcript):
    assert generate(client, saved_transcript)[0].status_code == 200
    client.app.dependency_overrides[current_user] = lambda: {
        'objectId': str(ADDITIONAL), 'roles': ['security-engineer']}
    assert client.post(BASE + '/accept', json={'expectedRevision': 2}).status_code == 200
    assert client.put(BASE + '/human', json={'expectedRevision': 3, **HUMAN}).status_code == 200
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 4, **HUMAN}).status_code == 403
    client.app.dependency_overrides[current_user] = lambda: {
        'objectId': str(PRIMARY), 'roles': ['security-engineer']}
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 4, **HUMAN}).status_code == 200


def test_closing_report_is_private_linkable_and_retryable(client, saved_transcript):
    report_id = str(uuid4())
    url = f'{BASE}/reports/{report_id}?fileName=closing.pdf'
    assert client.put(url, content=b'invalid').status_code == 422
    first = client.put(url, content=b'%PDF-report')
    assert first.status_code == 200, first.text
    assert client.put(url, content=b'%PDF-report').json() == first.json()
    assert client.put(url, content=b'%PDF-different').status_code == 409
    assert client.get(f'{BASE}/reports/{report_id}/download').content == b'%PDF-report'
    assert 'blob' not in first.json()['data']
    assert generate(client, saved_transcript, expected=2)[0].status_code == 200
    assert client.post(BASE + '/accept', json={'expectedRevision': 3}).status_code == 200
    assert client.put(BASE + '/human', json={'expectedRevision': 4, **HUMAN, 'reportId': report_id}).status_code == 200
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 5, **HUMAN, 'reportId': report_id}).status_code == 200
    assert client.post('/api/projects/import', json=payload(demand_id='3602', name='Other')).status_code == 201
    assert client.get(f'/api/projects/3602/security-reviews/reports/{report_id}/download').status_code == 404


def test_accepting_new_ai_source_requires_human_draft_refresh(client, saved_transcript):
    assert generate(client, saved_transcript)[0].status_code == 200
    assert client.post(BASE + '/accept', json={'expectedRevision': 2}).status_code == 200
    assert client.put(BASE + '/human', json={'expectedRevision': 3, **HUMAN}).status_code == 200
    assert generate(client, saved_transcript, expected=4)[0].status_code == 200
    assert client.get(BASE).json()['acceptedAI']['revision'] == 2
    assert client.post(BASE + '/accept', json={'expectedRevision': 5}).status_code == 200
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 6, **HUMAN}).status_code == 409
    assert client.put(BASE + '/human', json={'expectedRevision': 6, **HUMAN}).json()['sourceRevision'] == 5
    assert client.post(BASE + '/human/submit', json={'expectedRevision': 7, **HUMAN}).status_code == 200


def test_security_review_migration_round_trip():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, inspect

    path = Path(__file__).parents[1] / 'migrations/versions/20261109_security_reviews.py'
    spec = spec_from_file_location('security_migration', path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with create_engine('sqlite://').begin() as connection:
        connection.exec_driver_sql('CREATE TABLE projects (id CHAR(32) PRIMARY KEY)')
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert inspect(connection).has_table('security_review_versions')
            migration.downgrade()
            assert not inspect(connection).has_table('security_review_versions')


def test_legacy_inline_transcript_can_still_be_downloaded(client, database, security_project):
    from sqlalchemy.orm import Session
    from app.db.models import Project, SecurityReviewVersion

    with Session(database) as session, session.begin():
        project = session.query(Project).one()
        session.add(SecurityReviewVersion(project_id=project.id, kind='AI', revision=1, author_id='legacy',
            payload=json.dumps({'summary': 'Prior review', 'findings': [], 'sources': [SOURCE]})))
    assert client.get(BASE + '/ai/1/transcripts/1/download').content == SOURCE['text'].encode()
    assert client.get(BASE).json()['ai']['data']['sources'] == [{'fileName': SOURCE['fileName']}]


def test_transcript_generation_rejects_source_from_another_project(client, saved_transcript):
    assert client.post('/api/projects/import', json=payload(demand_id='3602', name='Other')).status_code == 201
    invoke = Mock()
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    result = client.post('/api/projects/3602/security-reviews/generate', json={
        'expectedRevision': 0, 'transcriptIds': [saved_transcript[0]],
    })
    assert result.status_code == 404
    invoke.assert_not_called()

def test_delete_unused_transcript_is_retryable_and_removes_blob(client, saved_transcript, monkeypatch):
    from azure.core.exceptions import AzureError

    file_id, store = saved_transcript
    url = f'{BASE}/transcripts/{file_id}'
    delete = store.delete
    monkeypatch.setattr(store, 'delete', Mock(side_effect=AzureError('unavailable')))
    assert client.delete(url).status_code == 503
    assert client.get(BASE).json()['transcripts'][0]['kind'] == 'TranscriptDeleting'
    assert client.get(url + '/download').status_code == 404
    blocked, invoke = generate(client, saved_transcript, expected=2)
    assert blocked.status_code == 404
    invoke.assert_not_called()
    monkeypatch.setattr(store, 'delete', delete)
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204
    assert not store.data
    assert client.get(BASE).json()['transcripts'] == []


def test_delete_cited_transcript_preserves_review_evidence(client, saved_transcript):
    file_id, store = saved_transcript
    assert generate(client, saved_transcript)[0].status_code == 200
    assert client.delete(f'{BASE}/transcripts/{file_id}').status_code == 409
    assert client.get(BASE + '/ai/2/transcripts/1/download').content == SOURCE['text'].encode()
    assert len(store.data) == 1


def test_regeneration_preserves_review_versions_and_requires_latest_draft(client, saved_transcript):
    assert generate(client, saved_transcript)[0].status_code == 200
    assert client.post(BASE + '/accept', json={'expectedRevision': 2, 'reviewRevision': 2}).status_code == 200
    assert generate(client, saved_transcript, expected=3, review={**AI, 'summary': 'Regenerated.'})[0].status_code == 200
    state = client.get(BASE).json()
    assert [(row['version'], row['revision'], row['status']) for row in state['aiVersions']] == [
        (1, 2, 'Accepted'), (2, 4, 'Draft'),
    ]
    assert state['acceptedAI']['revision'] == 2
    assert state['aiVersions'][0]['data']['summary'] == AI['summary']
    blocked = client.put(BASE + '/human', json={'expectedRevision': 4, **HUMAN})
    assert blocked.status_code == 409
    assert 'Accept the latest Security AI draft' in blocked.text
    assert client.get(BASE).json()['human'] is None
    assert client.post(BASE + '/accept', json={'expectedRevision': 4, 'reviewRevision': 2}).status_code == 409
    assert client.post(BASE + '/accept', json={'expectedRevision': 4, 'reviewRevision': 4}).status_code == 200
    state = client.get(BASE).json()
    assert [row['status'] for row in state['aiVersions']] == ['Accepted', 'Accepted']
    assert state['acceptedAI']['revision'] == 4
    saved = client.put(BASE + '/human', json={'expectedRevision': state['revision'], **HUMAN})
    assert saved.status_code == 200, saved.text
    assert saved.json()['sourceRevision'] == 4


def test_invalid_model_output_retries_with_schema_and_safe_diagnostics(client, saved_transcript, caplog):
    invoke = Mock(side_effect=[json.dumps({**AI, 'private_model_text': 'sensitive content'}), json.dumps(AI)])
    client.app.dependency_overrides[security_invoker] = lambda: invoke
    result = client.post(BASE + '/generate', json={'expectedRevision': 1, 'transcriptIds': [saved_transcript[0]]})
    assert result.status_code == 200, result.text
    first, second = [json.loads(call.args[0]) for call in invoke.call_args_list]
    assert 'readinessReason' in first['output_schema']['required']
    assert second['output_correction']['issues'] == [{'field': '<unknown>', 'code': 'extra_forbidden'}]
    assert 'private_model_text' not in caplog.text and 'sensitive content' not in caplog.text
    assert len(client.get(BASE).json()['aiVersions']) == 1


def test_persistent_invalid_model_output_does_not_save_draft(client, saved_transcript):
    response, invoke = generate(client, saved_transcript, review={'summary': 'Incomplete response'})
    assert response.status_code == 502
    assert 'invalid review format' in response.text
    assert invoke.call_count == 2
    assert client.get(BASE).json()['aiVersions'] == []
