from types import SimpleNamespace
from uuid import UUID
from app.core.auth import current_user
from app.modules.projects.ea_assignment_router import graph_resolver
from app.modules.projects.graph_identity import IdentityNotFound
from test_project_api import client, database, payload

PRIMARY = UUID("00000000-0000-4000-8000-000000000001")
ADDITIONAL = UUID("00000000-0000-4000-8000-000000000002")
OTHER = UUID("00000000-0000-4000-8000-000000000003")

def test_assignment_permissions_and_reimport(client, database):
    def resolver(upn):
        mapping = {"primary@example.com": PRIMARY, "additional@example.com": ADDITIONAL, "other@example.com": OTHER}
        return SimpleNamespace(object_id=mapping[upn])
    client.app.dependency_overrides[graph_resolver] = lambda: resolver
    initial = client.post("/api/projects/import", json=payload(markdown="- **Architect Assigned:** [Primary](mailto:primary@example.com)")).json()
    assert initial["revision"] == 1
    def user(oid, roles):
        client.app.dependency_overrides[current_user] = lambda: {"objectId": str(oid), "roles": roles}
    user(PRIMARY, ["enterprise-architect"])
    access = client.get("/api/projects/3601/ea-access").json()
    assert access["canEdit"] and access["canManageAdditional"]
    saved = client.patch("/api/projects/3601/additional-ea", json={"email": "additional@example.com", "expectedRevision": access["revision"]})
    assert saved.status_code == 200
    user(ADDITIONAL, ["enterprise-architect"])
    access = client.get("/api/projects/3601/ea-access").json()
    assert access["canEdit"] and not access["canManageAdditional"]
    assert client.patch("/api/projects/3601/additional-ea", json={"email": None, "expectedRevision": access["revision"]}).status_code == 403
    user(ADDITIONAL, ["general-users"])
    assert not client.get("/api/projects/3601/ea-access").json()["canEdit"]
    user(OTHER, ["Admin"])
    updated = client.post("/api/projects/import", json=payload(expectedRevision=saved.json()["revision"], markdown="- **Architect Assigned:** other@example.com"))
    assert updated.status_code == 200
    user(PRIMARY, ["enterprise-architect"])
    assert not client.get("/api/projects/3601/ea-access").json()["canEdit"]
    user(OTHER, ["enterprise-architect"])
    assert client.get("/api/projects/3601/ea-access").json()["canManageAdditional"]
    # Primary can remove the helper. A stale revision cannot restore it.
    latest = client.get("/api/projects/3601/ea-access").json()
    removed = client.patch("/api/projects/3601/additional-ea", json={"email": None, "expectedRevision": latest["revision"]})
    assert removed.status_code == 200
    assert removed.json()["additionalEmail"] is None
    assert client.patch("/api/projects/3601/additional-ea", json={"email": "additional@example.com", "expectedRevision": latest["revision"]}).status_code == 409
    user(ADDITIONAL, ["enterprise-architect"])
    assert not client.get("/api/projects/3601/ea-access").json()["canEdit"]


def test_failed_lookup_does_not_replace_existing_assignment(client, database):
    def resolver(upn):
        if upn == "primary@example.com": return SimpleNamespace(object_id=PRIMARY)
        raise IdentityNotFound()
    client.app.dependency_overrides[graph_resolver] = lambda: resolver
    assert client.post("/api/projects/import", json=payload(markdown="Architect Assigned: primary@example.com")).status_code == 201
    client.app.dependency_overrides[current_user] = lambda: {"objectId": str(PRIMARY), "roles": ["enterprise-architect"]}
    response = client.patch("/api/projects/3601/additional-ea", json={"email": "missing@example.com", "expectedRevision": 1})
    assert response.status_code == 422
    access = client.get("/api/projects/3601/ea-access").json()
    assert access["revision"] == 1 and access["additionalEmail"] is None
