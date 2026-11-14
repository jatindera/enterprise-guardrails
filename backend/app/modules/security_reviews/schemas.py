from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.core.api_model import APIModel


class Revision(APIModel):
    expected_revision: int = Field(ge=0)


class AcceptReview(Revision):
    review_revision: int | None = Field(default=None, ge=1)


class Generate(Revision):
    transcript_ids: list[UUID] = Field(min_length=1, max_length=10)

    @model_validator(mode='after')
    def unique_sources(self):
        if len(set(self.transcript_ids)) != len(self.transcript_ids):
            raise ValueError('Select each saved transcript once.')
        return self


class Finding(APIModel):
    kind: Literal['Requirement', 'Reported control', 'Open risk', 'Follow-up']
    text: str = Field(min_length=1, max_length=1200)
    transcript: int = Field(ge=1, le=10)
    line: int = Field(ge=1)


class AIReview(APIModel):
    summary: str = Field(min_length=1, max_length=4000)
    readiness: Literal['Ready for human assessment', 'Needs clarification']
    readiness_reason: str = Field(min_length=1, max_length=1200)
    findings: list[Finding] = Field(max_length=12)


class HumanDraft(Revision):
    risk: Literal['', 'Low', 'Medium', 'High'] = ''
    decision: Literal['', 'Approved', 'Conditional approval', 'On hold', 'Rejected'] = ''
    assessment: str = Field(default='', max_length=40000)
    rationale: str = Field(default='', max_length=6000)
    conditions: str = Field(default='', max_length=6000)
    report_id: UUID | None = None


class Reopen(Revision):
    reason: str = Field(min_length=1, max_length=1000, pattern=r'\S')
