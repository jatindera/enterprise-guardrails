"""Offline RSA token validation and HTTP authorization tests; no Entra/SQL calls."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jwt.exceptions import PyJWKClientConnectionError

from app.core.auth import TokenVerifier
from app.core.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def verifier(key):
    result = TokenVerifier(Settings(_env_file=None, environment="test"))
    result.keys = Mock()
    result.keys.get_signing_key_from_jwt.return_value = SimpleNamespace(key=key.public_key())
    return result


def token(key, verifier, **changes):
    now = int(datetime.now(timezone.utc).timestamp())
    claims = {
        "exp": now + 300, "iat": now, "nbf": now,
        "iss": verifier.issuer, "aud": verifier.settings.entra_api_client_id,
        "tid": verifier.settings.entra_tenant_id,
        "oid": "test-object", "sub": "test-subject", "ver": "2.0",
        "azp": verifier.settings.entra_frontend_client_id,
        "scp": "access_as_user", "roles": ["general-users"], "name": "Test user",
        **changes,
    }
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})


def test_valid_token(key, verifier):
    assert verifier.verify(token(key, verifier))["roles"] == ["general-users"]


@pytest.mark.parametrize("changes,status", [
    ({"aud": "wrong-api"}, 401),
    ({"iss": "https://wrong-issuer"}, 401),
    ({"tid": "wrong-tenant"}, 401),
    ({"ver": "1.0"}, 401),
    ({"exp": 1}, 401),
    ({"nbf": 9999999999}, 401),
    ({"azp": "wrong-client"}, 403),
    ({"scp": ""}, 403),
    ({"roles": []}, 403),
    ({"roles": ["unknown-role"]}, 403),
    ({"roles": "Admin"}, 403),
])
def test_reject_claims(key, verifier, changes, status):
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token(key, verifier, **changes))
    assert exc.value.status_code == status


def test_bad_signature(key, verifier):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token(other_key, verifier))
    assert exc.value.status_code == 401


def test_disallowed_algorithm(verifier):
    encoded = jwt.encode({"sub": "x"}, "a" * 64, algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        verifier.verify(encoded)
    assert exc.value.status_code == 401
    verifier.keys.get_signing_key_from_jwt.assert_not_called()


def test_key_service_unavailable(key, verifier):
    verifier.keys.get_signing_key_from_jwt.side_effect = PyJWKClientConnectionError("offline")
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token(key, verifier))
    assert exc.value.status_code == 503


def test_http_permissions(key, verifier):
    application = create_app(Settings(_env_file=None, environment="test"))
    application.state.token_verifier = verifier
    # Prove forbidden calls never reach a database dependency.
    from app.db.session import get_session
    def forbidden_database():
        raise AssertionError("Unauthorized request reached SQL")
    application.dependency_overrides[get_session] = forbidden_database
    with TestClient(application) as client:
        assert client.get("/api/health/live").status_code == 200
        response = client.get("/api/projects")
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert client.get("/api/auth/me", headers={"Authorization": "Bearer malformed"}).status_code == 401
        user_token = token(key, verifier)
        headers = {"Authorization": f"Bearer {user_token}"}
        assert client.get("/api/auth/me", headers=headers).json()["roles"] == ["general-users"]
        assert client.post("/api/projects/import", headers=headers, json={}).status_code == 403
        admin_token = token(key, verifier, roles=["Admin"])
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).json()["roles"] == ["Admin"]
        preflight = client.options("/api/projects", headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        })
        assert preflight.status_code == 200
