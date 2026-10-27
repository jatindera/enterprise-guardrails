"""Pure RAI access rules. Call only with verified token claims and DB bindings."""
from uuid import UUID


def _object_id(value: object) -> UUID | None:
    try:
        return UUID(str(value)) if value is not None else None
    except (ValueError, TypeError, AttributeError):
        return None


def rai_permissions(user: dict, primary_id: UUID | None, additional_id: UUID | None) -> tuple[bool, bool]:
    """Return (can_edit, can_manage_additional); missing IDs fail closed."""
    roles = user.get("roles", [])
    if not isinstance(roles, (list, tuple)):
        return False, False
    if "Admin" in roles:
        return True, True
    oid = _object_id(user.get("objectId"))
    if oid is None or "rai-manager" not in roles:
        return False, False
    primary = _object_id(primary_id)
    additional = _object_id(additional_id)
    is_primary = primary is not None and oid == primary
    return is_primary or (additional is not None and oid == additional), is_primary
