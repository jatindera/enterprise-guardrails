import io
import json
from unittest.mock import patch
from urllib.error import HTTPError
from uuid import UUID
import pytest
from app.modules.projects.graph_identity import resolve_upn, IdentityLookupUnavailable, IdentityNotFound


class Credential:
    def get_token(self, scope):
        assert scope == "https://graph.microsoft.com/.default"
        return type("Token", (), {"token": "test-token"})()


def response(body):
    return io.BytesIO(json.dumps(body).encode())


def test_exact_upn_and_id():
    obj = "27747bdd-7e9f-442e-a9d8-96ba640394f0"
    with patch("app.modules.projects.graph_identity.urlopen", return_value=response({"id": obj, "userPrincipalName": "ea@example.com"})):
        assert resolve_upn("EA@example.com", Credential()).object_id == UUID(obj)


def test_not_found_and_bad_response():
    error = HTTPError("https://graph.microsoft.com", 404, "not found", {}, None)
    with patch("app.modules.projects.graph_identity.urlopen", side_effect=error):
        with pytest.raises(IdentityNotFound): resolve_upn("missing@example.com", Credential())
    with patch("app.modules.projects.graph_identity.urlopen", return_value=response({"id": "bad", "userPrincipalName": "ea@example.com"})):
        with pytest.raises(IdentityLookupUnavailable): resolve_upn("ea@example.com", Credential())


def test_path_injection_rejected():
    with pytest.raises(ValueError): resolve_upn("a@example.com/extra", Credential())
