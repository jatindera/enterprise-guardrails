from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def client():
    settings = Settings(
        _env_file=None,
        environment="test",
        cors_origins=["http://localhost:5173"],
    )

    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_request_ids_are_valid_and_unique(client):
    first = client.get("/api/health/live")
    second = client.get("/api/health/live")

    first_id = first.headers["X-Request-ID"]
    second_id = second.headers["X-Request-ID"]

    UUID(first_id)
    UUID(second_id)

    assert first_id != second_id


def test_unknown_route_has_consistent_error(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404

    error = response.json()["error"]

    assert error["code"] == "http_404"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_allowed_frontend_origin(client):
    response = client.get(
        "/api/health/live",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.headers["Access-Control-Allow-Origin"] == (
        "http://localhost:5173"
    )


def test_unlisted_origin_is_not_granted_cors(client):
    response = client.get(
        "/api/health/live",
        headers={"Origin": "https://unlisted.example"},
    )

    assert "Access-Control-Allow-Origin" not in response.headers


def test_preflight_allows_authorization_header(client):
    response = client.options(
        "/api/health/live",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200