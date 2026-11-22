import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx


def test_diagnostic_isolates_vectorizer_error_and_never_prints_tokens(monkeypatch, capsys):
    path = Path(__file__).resolve().parents[1] / "scripts" / "check_rai_search.py"
    spec = importlib.util.spec_from_file_location("check_rai_search", path)
    diagnostic = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(diagnostic)

    credential = MagicMock()
    credential.get_token.return_value.token = "secret-test-token"
    monkeypatch.setattr(diagnostic, "AzureCliCredential", lambda: credential)
    monkeypatch.setattr(diagnostic, "RAISearchSettings", lambda: SimpleNamespace(
        endpoint="https://example.search.windows.net", index="rai-policy-index",
        auth_mode="azure_cli", managed_identity_client_id=None,
        vector_field="text_vector", timeout_seconds=15,
    ))
    calls = []

    def respond(request):
        import json
        body = json.loads(request.content)
        calls.append(body)
        if "vectorQueries" in body:
            return httpx.Response(400, json={"error": {
                "code": "InvalidRequestParameter", "message": "Could not complete vectorization action.",
            }})
        return httpx.Response(200, json={"value": [{"chunk_id": "one", "title": "Questions.md"}]})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(diagnostic.httpx, "Client", lambda **kwargs: client)
    assert diagnostic.main() == 1
    output = capsys.readouterr().out
    assert len(calls) == 2
    assert "vectorQueries" not in calls[0]
    assert "HTTP 200" in output and "HTTP 400" in output
    assert "Could not complete vectorization action." in output
    assert "secret-test-token" not in output
