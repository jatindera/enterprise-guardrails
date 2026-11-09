from datetime import datetime
from uuid import UUID
from pydantic import Field, model_validator
from app.modules.projects.schemas import APIModel

class ArtifactSummary(APIModel):
    id: UUID
    file_name: str
    description: str
    size_bytes: int
    uploaded_by_name: str
    uploaded_at: datetime

class ArtifactPage(APIModel):
    items: list[ArtifactSummary]


class GenerateDiagram(APIModel):
    source_review_id: UUID
    human_review_id: UUID | None = None
    expected_human_revision: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def require_draft_revision(self):
        if (self.human_review_id is None) != (self.expected_human_revision is None):
            raise ValueError("Provide both the human review ID and its saved revision.")
        return self


class GeneratedDiagram(APIModel):
    source_review_id: UUID
    source_review_version: int
    drawio: str
    svg: str
    human_review_id: UUID | None = None
    human_review_revision: int | None = None
