from uuid import uuid4
import pytest
from app.modules.projects.security_access import security_permissions
from app.modules.projects.security_upn import security_upn_from_intake, AmbiguousSecurity


def test_security_roles_and_assignments():
    primary, helper, stranger = uuid4(), uuid4(), uuid4()
    def access(oid, roles):
        return security_permissions({'objectId': str(oid), 'roles': roles}, primary, helper)
    assert access(primary, ['security-engineer']) == (True, True)
    assert access(helper, ['security-engineer']) == (True, False)
    assert access(helper, ['general-users']) == (False, False)
    assert access(stranger, ['security-engineer']) == (False, False)
    assert access(stranger, ['Admin']) == (True, True)


def test_security_upn_formats_and_ambiguity():
    assert security_upn_from_intake('| Security Resource Assigned | Jane <jane@example.com> |').upn == 'jane@example.com'
    assert security_upn_from_intake('- **Security Resource Assigned:** [Jane](mailto:jane@example.com)').upn == 'jane@example.com'
    assert security_upn_from_intake('unrelated jane@example.com').present is False
    with pytest.raises(AmbiguousSecurity):
        security_upn_from_intake('| Security Resource Assigned | a@example.com b@example.com |')


def test_access_response_grants_closure_to_primary_or_admin_only():
    from types import SimpleNamespace
    from app.modules.projects.security_assignment import _view
    primary, helper, admin = uuid4(), uuid4(), uuid4()
    project = SimpleNamespace(assigned_security_object_id=primary,
        additional_security_object_id=helper, additional_security_email='helper@example.com', revision=1)
    assert _view(project, {'objectId': str(primary), 'roles': ['security-engineer']})['canClose'] is True
    assert _view(project, {'objectId': str(helper), 'roles': ['security-engineer']})['canClose'] is False
    assert _view(project, {'objectId': str(admin), 'roles': ['Admin']})['canClose'] is True
