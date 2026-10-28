from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator
from app.modules.projects.schemas import APIModel

Domain = Literal["EA", "Security", "RAI"]
Decision = Literal["Approved", "Conditional approval", "On hold", "Rejected", "Not applicable"]

class SaveDecision(APIModel):
    decision: Decision
    comments: str = Field(min_length=1, max_length=4000)
    expected_revision: int = Field(ge=0, strict=True)
    @field_validator("comments")
    @classmethod
    def validate_comments(cls, value):
        value = value.strip()
        if not value or len(value.encode("utf-16-le")) // 2 > 4000:
            raise ValueError("Enter review comments of at most 4000 characters.")
        return value

class ChangeApplicability(APIModel):
    required: bool = Field(strict=True)
    expected_revision: int = Field(ge=1, strict=True)

class DecisionRecord(APIModel):
    id: UUID
    domain: Domain
    revision: int
    decision: Decision
    comments: str
    reviewer_name: str
    actor_name: str
    recorded_at: datetime

class ReviewerState(APIModel):
    domain: Domain
    reviewer: str
    can_edit: bool
    revision: int
    current: bool
    saved: DecisionRecord | None

class GateState(APIModel):
    required: bool
    project_revision: int
    can_change_applicability: bool
    combined_status: str
    reviewers: list[ReviewerState]
    history: list[DecisionRecord]
