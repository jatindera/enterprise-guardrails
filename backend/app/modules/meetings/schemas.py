from typing import Literal
from datetime import datetime
from pydantic import Field, model_validator
from app.core.api_model import APIModel

Domain = Literal['EA', 'Security', 'RAI']


class Question(APIModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    focus: Domain
    question: str = Field(max_length=4000)
    reason: str = Field(default='', max_length=2000)
    priority: Literal['Essential', 'Follow-up']
    source: Literal['manual', 'ai'] = 'manual'
    selected: bool = False


class MeetingDraft(APIModel):
    prepared_questions: list[Question] = Field(default_factory=list, max_length=100)
    additional_questions: list[Question] = Field(default_factory=list, max_length=100)
    current_question_id: str | None = Field(default=None, max_length=64)
    asked_question_ids: list[str] = Field(default_factory=list, max_length=200)

    @model_validator(mode='after')
    def valid_references(self):
        questions = self.prepared_questions + self.additional_questions
        ids = [q.id for q in questions]
        if len(ids) != len(set(ids)) or len(self.asked_question_ids) != len(set(self.asked_question_ids)):
            raise ValueError('Duplicate question IDs.')
        if not set(self.asked_question_ids).issubset(ids):
            raise ValueError('Asked questions must exist.')
        if self.current_question_id and self.current_question_id not in self.asked_question_ids:
            raise ValueError('Current question must be asked.')
        for q in questions:
            if (q.selected or q.id in self.asked_question_ids) and not q.question.strip():
                raise ValueError('Selected and asked questions cannot be empty.')
        return self


class SaveMeeting(MeetingDraft):
    expected_revision: int = Field(ge=0, strict=True)


class MeetingState(MeetingDraft):
    revision: int
    can_edit: bool
    asked_at: dict[str, datetime] = Field(default_factory=dict)
