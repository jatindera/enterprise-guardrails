from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator
from app.modules.projects.schemas import APIModel

VoteChoice = Literal["For", "Against"]


class SubmitVote(APIModel):
    round_number: int = Field(ge=1, strict=True)
    choice: VoteChoice
    reason: str | None = Field(default=None, max_length=2000)
    # Zero means the caller has not previously recorded a vote.
    expected_revision: int = Field(ge=0, strict=True)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        if value and len(value.encode("utf-16-le")) // 2 > 2000:
            raise ValueError("Reason exceeds the database text limit.")
        return value or None

    @model_validator(mode="after")
    def validate_choice_reason(self):
        if self.choice == "Against" and not self.reason:
            raise ValueError("A reason is required when voting against.")
        if self.choice == "For":
            self.reason = None
        return self


class RecordedVote(APIModel):
    choice: VoteChoice
    reason: str | None
    revision: int
    recorded_at: datetime

    @field_validator("recorded_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class VoterSummary(RecordedVote):
    voter_object_id: UUID
    # NULL identifies votes recorded before name snapshots were introduced.
    voter_name: str | None


class RoundAction(APIModel):
    round_number: int = Field(ge=1, strict=True)


class ReopenRound(RoundAction):
    reason: str = Field(min_length=1, max_length=2000)

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value.encode("utf-16-le")) // 2 > 2000:
            raise ValueError("Enter a reason of at most 2000 characters.")
        return value


class RoundSummary(APIModel):
    number: int
    status: Literal["Open", "Closed"]
    outcome: Literal["Passed", "Returned for review"] | None
    opened_at: datetime | None
    opened_by_name: str | None
    reopen_reason: str | None
    closed_at: datetime | None
    closed_by_name: str | None

    @field_validator("opened_at", "closed_at")
    @classmethod
    def utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class VotingResult(APIModel):
    round_number: int
    current_round_number: int
    status: Literal["Open", "Closed"]
    outcome: Literal["Passed", "Returned for review"] | None
    closed_at: datetime | None
    closed_by_name: str | None
    reopen_reason: str | None
    can_close: bool
    can_reopen: bool
    rounds: list[RoundSummary]

    @field_validator("closed_at")
    @classmethod
    def utc(cls, value: datetime | None) -> datetime | None:
        return RoundSummary.utc(value)

    in_favour: int
    against: int
    total: int
    can_vote: bool
    my_vote: RecordedVote | None
    votes: list[VoterSummary]
