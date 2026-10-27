from uuid import uuid4
from types import SimpleNamespace
from app.modules.projects.rai_access import rai_permissions
from app.modules.projects.rai_assignment import _view


def test_rai_assignment_permissions():
    primary, helper, outsider = uuid4(), uuid4(), uuid4()
    project = SimpleNamespace(assigned_rai_object_id=primary, additional_rai_object_id=helper, additional_rai_email='help@example.com', revision=1)
    def access(oid, roles):
        return _view(project, {'objectId': str(oid), 'roles': roles})
    assert (access(primary, ['rai-manager'])['canEdit'], access(primary, ['rai-manager'])['canClose']) == (True, True)
    assert (access(helper, ['rai-manager'])['canEdit'], access(helper, ['rai-manager'])['canClose']) == (True, False)
    assert access(helper, ['general-users'])['canEdit'] is False
    assert access(outsider, ['rai-manager'])['canEdit'] is False
    assert access(outsider, ['Admin'])['canClose'] is True
    assert rai_permissions({'objectId': 'invalid', 'roles': ['rai-manager']}, primary, helper) == (False, False)
