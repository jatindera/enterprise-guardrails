"""Run from backend with uv run --locked python scripts/check_rai_search.py."""
from pathlib import Path
import sys

import httpx
from azure.core.exceptions import AzureError
from azure.identity import AzureCliCredential, ManagedIdentityCredential

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.tools.policy_search import RAISearchSettings


def check(client, settings, headers, label, body):
    print(f"\n{label}", flush=True)
    response = client.post(
        f"{settings.endpoint.rstrip('/')}/indexes/{settings.index}/docs/search",
        params={"api-version": "2026-04-01"},
        headers=headers,
        json=body,
    )
    print(f"HTTP {response.status_code}", flush=True)
    if not response.is_success:
        # Only these fixed diagnostic queries are used. Never print request headers or tokens.
        try:
            error = response.json().get("error", {})
            print(f"Code: {error.get('code', '(none)')}")
            print(f"Message: {str(error.get('message', 'No error message returned.'))[:2500]}")
        except ValueError:
            print("Response was not JSON. Check Search access and network settings.")
        request_id = response.headers.get("request-id") or response.headers.get("x-ms-request-id")
        if request_id:
            print(f"Search request ID: {request_id}")
        return False
    hits = response.json().get("value", [])
    print(f"Returned {len(hits)} result(s).")
    for hit in hits:
        print(f"Source: {hit.get('title') or '(title missing)'}")
    return True


def main():
    settings = RAISearchSettings()
    print(f"Search endpoint: {settings.endpoint}")
    print(f"Index: {settings.index}")
    print(f"Authentication: {settings.auth_mode}")
    credential = (AzureCliCredential() if settings.auth_mode == "azure_cli"
                  else ManagedIdentityCredential(client_id=settings.managed_identity_client_id))
    with credential, httpx.Client(timeout=settings.timeout_seconds) as client:
        token = credential.get_token("https://search.azure.com/.default").token
        headers = {"Authorization": f"Bearer {token}"}
        if not check(client, settings, headers, "1. Index access and keyword search", {
            "search": "*", "select": "chunk_id,title", "top": 1,
        }):
            print("Index access failed. Resolve the error above before testing vectorization.")
            return 1
        if not check(client, settings, headers, "2. Hybrid search and embedding vectorizer", {
            "search": "Responsible AI human oversight",
            "select": "chunk_id,parent_id,chunk,title",
            "top": 1,
            "vectorQueries": [{
                "kind": "text", "text": "Responsible AI human oversight",
                "fields": settings.vector_field, "k": 5,
            }],
        }):
            print("Index access succeeded. Check the reported hybrid-query or vectorizer error.")
            return 1
    print("\nBoth Search checks passed. Retry RAI question generation.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (httpx.RequestError, ValueError, AzureError) as exc:
        print(f"Diagnostic failed before an HTTP response: {type(exc).__name__}")
        sys.exit(1)
