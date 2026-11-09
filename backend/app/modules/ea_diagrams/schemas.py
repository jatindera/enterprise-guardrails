from datetime import datetime
from uuid import UUID
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


class GeneratedDiagram(APIModel):
    source_review_id: UUID
    source_review_version: int
    drawio: str
    svg: str
