from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator
from app.core.api_model import APIModel
from app.modules.intake.schemas import IntakeContext




DemandId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{1,64}$")]
ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
BusinessFunction = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Architect = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=320)]


class ImportProject(APIModel):
    demand_id: DemandId
    name: ProjectName
    business_function: BusinessFunction | None = None
    assigned_ea: Architect | None = None
    file_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=260)]
    markdown: str = Field(min_length=1, max_length=2 * 1024 * 1024)
    # Omit/null to create; the current revision is mandatory to update.
    expected_revision: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("file_name")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        if not value.lower().endswith(".md") or "/" in value or "\\" in value:
            raise ValueError("Use a Markdown filename without a directory path.")
        return value

    @field_validator("markdown")
    @classmethod
    def validate_markdown(cls, value: str) -> str:
        if not value.strip() or len(value.encode("utf-8")) > 2 * 1024 * 1024:
            raise ValueError("Markdown must be nonempty and no larger than 2 MiB.")
        return value

    @field_validator("name", "business_function", "assigned_ea", "file_name")
    @classmethod
    def validate_sql_text_length(cls, value: str | None, info) -> str | None:
        limits = {"name": 300, "business_function": 200, "assigned_ea": 320, "file_name": 260}
        if value is not None and len(value.encode("utf-16-le")) // 2 > limits[info.field_name]:
            raise ValueError("Value exceeds the database text length limit.")
        return value


class ProjectSummary(APIModel):
    id: UUID
    demand_id: str
    name: str
    business_function: str
    assigned_ea: str
    assigned_security: str
    assigned_rai: str
    arb_required: bool
    gate_required: bool
    production_status: str
    go_live_date: date | None
    production_comments: str
    production_saved_at: datetime | None
    production_saved_by: str | None
    production_revision: int
    revision: int
    created_at: datetime
    updated_at: datetime


class ProjectDetail(ProjectSummary):
    intake_context: IntakeContext | None = None


class ProjectPage(APIModel):
    items: list[ProjectSummary]
    total: int
    offset: int
    limit: int


class UpdateRAIAssignment(APIModel):
    assigned_rai: Architect
    expected_revision: int = Field(ge=1, strict=True)

    @field_validator("assigned_rai")
    @classmethod
    def validate_reviewer_length(cls, value: str) -> str:
        if len(value.encode("utf-16-le")) // 2 > 320:
            raise ValueError("Reviewer name exceeds the database length limit.")
        return value


class UpdateARBApplicability(APIModel):
    arb_required: bool = Field(strict=True)
    expected_revision: int = Field(ge=1, strict=True)
