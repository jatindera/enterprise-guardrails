from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.api_model import APIModel

class CreateMeeting(APIModel):
    title: str = Field(default='', max_length=200)

class Revision(APIModel):
    expected_revision: int = Field(ge=1, strict=True)

class ReopenReview(Revision):
    reason: str = Field(min_length=1, max_length=1000)


TECHNOLOGIES = (
    "Azure","Foundry","Copilot Studio","M365 agent","Power Apps","Databricks","SAP BTP",
    "Salesforce","SaaS / Third-party service","External APIs","Networking / Connectivity",
    "Microsoft 365 / SharePoint","Power Automate","Power BI","On-premises systems","Others",
)


class ProposalUpdate(Revision):
    technologies: list[str] = Field(max_length=16)
    rationale: str = Field(default='',max_length=4000)

    @field_validator('technologies')
    @classmethod
    def valid_technologies(cls,value):
        if len(set(value))!=len(value) or any(t not in TECHNOLOGIES for t in value):
            raise ValueError('Select unique supported technologies.')
        return [t for t in TECHNOLOGIES if t in value]

    @field_validator('rationale')
    @classmethod
    def valid_rationale(cls,value):
        if len(value.encode('utf-16-le'))//2>4000: raise ValueError('Rationale is too long.')
        return value.strip()

    @model_validator(mode='after')
    def describe_others(self):
        if 'Others' in self.technologies and not self.rationale:
            raise ValueError('Describe other technologies in the rationale.')
        return self


class TechnologyReview(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['Reviewed','Needs clarification']
    feedback: str = Field(min_length=1,max_length=2000)


class EditReview(Revision):
    parent_review_id: UUID
    text: str = Field(min_length=1, max_length=16000)

class Citation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['transcript', 'review']
    id: UUID
    line: int = Field(ge=1)
    excerpt_truncated: bool = False
    quote: str = Field(min_length=1, max_length=240, description=(
        'Verbatim source excerpt supplied by the backend for new reviews. '
        'A long source line is shortened only when excerpt_truncated is true.'))

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
    technology_review: TechnologyReview | None = None
    findings: list[Finding] = Field(min_length=1, max_length=12)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=6)



class SourceReference(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['transcript']
    id: UUID
    line: int = Field(ge=1, strict=True, description='Exact supplied numbered source line, not a timestamp.')


class ReferencedFinding(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['requirement','question_answer','open_item','resolved_item','change','contradiction']
    text: str = Field(min_length=1, max_length=1500)
    question: str | None = Field(default=None, max_length=2000)
    answer: str | None = Field(default=None, max_length=2000)
    citations: list[SourceReference] = Field(min_length=1, max_length=4)


class ReferencedReview(BaseModel):
    """Model response contract. Source excerpts are supplied by the backend."""
    model_config = ConfigDict(extra='forbid')
    summary: str = Field(min_length=1, max_length=3000)
    technology_review: TechnologyReview
    findings: list[ReferencedFinding] = Field(min_length=1, max_length=12)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode='after')
    def clarification_questions_required(self):
        if self.technology_review.status=='Needs clarification' and not self.follow_up_questions:
            raise ValueError('Clarification requires follow-up questions.')
        return self



def validation_issues(error):
    """Return only safe field names/indexes and error codes, never source values."""
    allowed = {
        'summary', 'findings', 'follow_up_questions', 'kind', 'text', 'question',
        'answer', 'prepared_question_id', 'citations', 'id', 'line', 'quote',
        'technology_review', 'status', 'feedback',
    }
    return [
        {'type': e['type'], 'loc': [
            part if isinstance(part, int) or part in allowed else '<unknown_field>'
            for part in e['loc']]}
        for e in error.errors(include_input=False, include_context=False, include_url=False)[:20]
    ]
