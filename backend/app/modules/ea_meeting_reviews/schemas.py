from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.core.api_model import APIModel

class CreateMeeting(APIModel):
    title: str = Field(default='', max_length=200)

class Revision(APIModel):
    expected_revision: int = Field(ge=1, strict=True)

class EditReview(Revision):
    parent_review_id: UUID
    text: str = Field(min_length=1, max_length=16000)

class Citation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['transcript', 'review']
    id: UUID
    line: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=240)

class Finding(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['requirement','question_answer','open_item','resolved_item','change','contradiction']
    text: str = Field(min_length=1, max_length=1500)
    question: str | None = Field(default=None, max_length=2000)
    answer: str | None = Field(default=None, max_length=2000)
    prepared_question_id: str | None = Field(default=None, max_length=64)
    citations: list[Citation] = Field(min_length=1, max_length=4)

class ReviewResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    summary: str = Field(min_length=1, max_length=3000)
    findings: list[Finding] = Field(min_length=1, max_length=12)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=6)
