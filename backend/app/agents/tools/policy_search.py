"""Retrieve reference chunks from the standard Azure AI Search vector index."""
from dataclasses import dataclass
from typing import Literal

import httpx
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.policy_citation import PolicyCitation


class RAISearchSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_RAI_SEARCH_", extra="ignore")

    endpoint: str = Field(pattern=r"^https://[a-z0-9-]+\.search\.windows\.net/?$")
    index: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,127}$")
    auth_mode: Literal["azure_cli", "managed_identity"] = "azure_cli"
    managed_identity_client_id: str | None = None
    vector_field: str = Field(default="text_vector", pattern=r"^[A-Za-z][A-Za-z0-9_]*$")
    timeout_seconds: float = Field(default=15, gt=0, le=60)


@dataclass(frozen=True)
class PolicyExcerpt:
    citation: PolicyCitation
    text: str


def search_policy(settings: RAISearchSettings, query: str) -> list[PolicyExcerpt]:
    fields = ["chunk_id", "parent_id", "chunk", "title"]
    credential = (AzureCliCredential() if settings.auth_mode == "azure_cli"
                  else ManagedIdentityCredential(client_id=settings.managed_identity_client_id))
    with credential, httpx.Client(timeout=settings.timeout_seconds) as client:
        token = credential.get_token("https://search.azure.com/.default").token
        response = client.post(
            f"{settings.endpoint.rstrip('/')}/indexes/{settings.index}/docs/search",
            params={"api-version": "2026-04-01"},
            headers={"Authorization": f"Bearer {token}"},
            json={
                "search": query,
                "select": ",".join(fields),
                "top": 6,
                "vectorQueries": [{"kind": "text", "text": query, "fields": settings.vector_field, "k": 20}],
            },
        )
        response.raise_for_status()
        hits = response.json()["value"]
    excerpts = []
    for hit in hits:
        if not hit.get("chunk", "").strip() or not hit.get("chunk_id"):
            continue
        citation = PolicyCitation(
            title=hit.get("title") or "RAI reference document",
            chunk_id=hit["chunk_id"],
        )
        excerpts.append(PolicyExcerpt(citation, hit["chunk"][:850]))
    if hits and not excerpts:
        raise ValueError("Search results lack usable reference text or chunk IDs.")
    return excerpts


def search_rai_policy(query: str) -> list[PolicyExcerpt]:
    return search_policy(RAISearchSettings(), query)
