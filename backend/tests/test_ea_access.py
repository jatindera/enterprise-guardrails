from uuid import uuid4
from app.modules.projects.ea_access import ea_permissions


def test_primary_additional_and_other_architects():
    primary, additional, other = uuid4(), uuid4(), uuid4()
    def user(oid): return {"objectId": str(oid), "roles": ["enterprise-architect"]}
    assert ea_permissions(user(primary), primary, additional) == (True, True)
    assert ea_permissions(user(additional), primary, additional) == (True, False)
    assert ea_permissions(user(other), primary, additional) == (False, False)


def test_role_and_id_required_and_admin_override():
    assigned = uuid4()
    assert ea_permissions({"objectId": str(assigned), "roles": ["security-engineer"]}, assigned, None) == (False, False)
    assert ea_permissions({"objectId": "invalid", "roles": ["enterprise-architect"]}, None, None) == (False, False)
    assert ea_permissions({"objectId": str(assigned), "roles": ["enterprise-architect"]}, None, None) == (False, False)
    assert ea_permissions({"objectId": str(uuid4()), "roles": ["Admin"]}, None, None) == (True, True)
