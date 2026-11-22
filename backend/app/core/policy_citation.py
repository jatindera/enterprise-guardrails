from pydantic import Field, field_validator
from urllib.parse import urlsplit

from app.core.api_model import APIModel


class PolicyCitation(APIModel):
    title: str = Field(min_length=1, max_length=300)
    chunk_id: str | None = Field(default=None, max_length=4096)
    policy_id: str | None = Field(default=None, min_length=1, max_length=100)
    version: str | None = Field(default=None, min_length=1, max_length=100)
    location: str | None = Field(default=None, max_length=300)
    url: str | None = Field(default=None, max_length=2048)

    @field_validator("url")
    @classmethod
    def https_link(cls, value):
        if value is None:
            return None
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or "\\" in value:
            raise ValueError("Policy links must be HTTPS URLs.")
        return value
