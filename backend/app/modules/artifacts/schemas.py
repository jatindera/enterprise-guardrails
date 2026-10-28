from datetime import datetime
from uuid import UUID
from app.modules.projects.schemas import APIModel

class ArtifactSummary(APIModel):
    id: UUID
    file_name: str
    size_bytes: int
    uploaded_by_name: str
    uploaded_at: datetime

class ArtifactPage(APIModel):
    items: list[ArtifactSummary]
