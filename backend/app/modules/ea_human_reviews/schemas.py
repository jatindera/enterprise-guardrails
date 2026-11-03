"""Human-authored fields; client cannot set identity, status or source text."""
from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator, model_validator
from app.core.api_model import APIModel

class Revision(APIModel):
    expected_revision: int = Field(ge=1, strict=True)

class CreateDraft(APIModel):
    source_review_id: UUID
    expected_project_revision: int = Field(ge=1, strict=True)
    expected_current_review_id: UUID | None = None
    expected_current_revision: int = Field(default=0, ge=0, strict=True)
    replace_draft: bool = Field(default=False, strict=True)

    @model_validator(mode='after')
    def current_pair(self):
        if (self.expected_current_review_id is None) != (self.expected_current_revision == 0):
            raise ValueError('Supply both current review ID and revision, or neither.')
        return self

class SaveDraft(Revision):
    review_text: str = Field(min_length=1, max_length=20000)
    technology_stack: str = Field(default='', max_length=2000)
    technology_rationale: str = Field(default='', max_length=4000)
    complexity: Literal['Low','Medium','High'] | None = None
    decision: Literal['Approved','Conditional approval','On hold','Rejected'] | None = None
    decision_rationale: str = Field(default='', max_length=4000)
    conditions: str = Field(default='', max_length=4000)

    @field_validator('review_text','technology_stack','technology_rationale','decision_rationale','conditions')
    @classmethod
    def clean_text(cls, value, info):
        limit={'review_text':20000,'technology_stack':2000}.get(info.field_name,4000)
        if len(value.encode('utf-16-le'))//2 > limit: raise ValueError('Text exceeds SQL text limit.')
        value=value.strip()
        if info.field_name=='review_text' and not value: raise ValueError('Review text is required.')
        return value

class SubmitReview(Revision):
    expected_project_revision: int = Field(ge=1, strict=True)
    confirmed: bool = Field(strict=True)

    @field_validator('confirmed')
    @classmethod
    def confirmation(cls,value):
        if not value: raise ValueError('Explicit confirmation is required.')
        return value

class ReopenReview(Revision):
    expected_project_revision: int = Field(ge=1, strict=True)
    reason: str = Field(min_length=1,max_length=1000)

    @field_validator('reason')
    @classmethod
    def meaningful_reason(cls,value):
        value=value.strip()
        if not value or len(value.encode('utf-16-le'))//2>1000: raise ValueError('A bounded reopen reason is required.')
        return value
