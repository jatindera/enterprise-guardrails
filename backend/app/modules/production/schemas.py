from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator, model_validator
from app.modules.projects.schemas import APIModel

Status = Literal["Not deployed", "In production"]

class SubmitDeployment(APIModel):
    production_status: Status
    go_live_date: date | None = None
    comments: str = Field(default="", max_length=4000)
    expected_revision: int = Field(ge=0, strict=True)

    @field_validator("comments")
    @classmethod
    def trim_comments(cls, value):
        value = value.strip()
        if len(value.encode("utf-16-le")) // 2 > 4000:
            raise ValueError("Comments exceed the database length limit.")
        return value

    @model_validator(mode="after")
    def validate_date(self):
        if self.production_status == "In production":
            if self.go_live_date is None:
                raise ValueError("Enter the actual go-live date.")
            if self.go_live_date > datetime.now(timezone.utc).date():
                raise ValueError("The actual go-live date cannot be after today's UTC date.")
        elif self.go_live_date is not None:
            raise ValueError("Not deployed must not include a go-live date.")
        return self

class DeploymentHistory(APIModel):
    id: UUID
    revision: int
    production_status: Status
    go_live_date: date | None
    comments: str
    actor_name: str
    recorded_at: datetime

class DeploymentState(APIModel):
    production_status: Status
    go_live_date: date | None
    comments: str
    saved_at: datetime | None
    saved_by: str | None
    revision: int
    project_revision: int
    can_submit: bool
    can_mark_in_production: bool
    blocker: str | None
    history: list[DeploymentHistory]

    @field_validator("saved_at")
    @classmethod
    def saved_utc(cls, value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
