"""Simulate a connection allowing only one outstanding result."""
from uuid import UUID
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import Project, EAReviewMeeting
from app.modules.ea_meeting_reviews.service import detail
from test_ea_review_history import client, database, setup, create, upload


class SingleActiveResultSession:
    def __init__(self, session):
        self.session = session
        self.busy = False

    def scalar(self, statement):
        assert not self.busy, 'Connection is busy with results for another command'
        return self.session.scalar(statement)

    def scalars(self, statement):
        assert not self.busy, 'Connection is busy with results for another command'
        result = self.session.scalars(statement)
        self.busy = True

        def consume():
            try:
                yield from result
            finally:
                result.close()
                self.busy = False
        return consume()


@pytest.mark.parametrize('file_count', [0, 2])
def test_detail_finishes_each_result_before_next_query(client, database, setup, file_count):
    meeting = create(client)
    for index in range(file_count):
        assert upload(client, meeting, text=f'Transcript {index}', name=f'meeting-{index}.txt').status_code == 200
    with Session(database) as session:
        project = session.scalar(select(Project))
        saved = session.get(EAReviewMeeting, UUID(meeting['id']))
        guarded = SingleActiveResultSession(session)
        result = detail(guarded, project, saved, (True, True))
        assert result['isCurrent'] is True
        assert len(result['transcripts']) == file_count
        assert result['reopenHistory'] == []
        assert not guarded.busy
