"""Resolve a confirmed Entra user principal name to its object ID.

This helper is not yet connected to the import or assignment endpoints.
The caller must establish authorization before performing a lookup.
"""
import json
from dataclasses import dataclass
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

GRAPH_SCOPE = "https://graph.microsoft.com/.default"


class IdentityNotFound(Exception):
    pass


class IdentityLookupUnavailable(Exception):
    pass


@dataclass(frozen=True)
class DirectoryUser:
    object_id: UUID
    user_principal_name: str


def resolve_upn(upn: str, credential, *, timeout: float = 10.0) -> DirectoryUser:
    """Resolve by exact UPN; never grant access from the UPN or response alone."""
    upn = upn.strip()
    if not upn or len(upn) > 320 or "@" not in upn or any(c in upn for c in "/?#\\"):
        raise ValueError("Enter a valid sign-in email address.")
    # Encode as a path segment. Select only the properties this lookup needs.
    url = f"https://graph.microsoft.com/v1.0/users/{quote(upn, safe='')}?$select=id,userPrincipalName"
    try:
        token = credential.get_token(GRAPH_SCOPE).token
        request = Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        with urlopen(request, timeout=timeout) as response:
            data = json.load(response)
    except HTTPError as exc:
        if exc.code == 404:
            raise IdentityNotFound("No directory user was found for that sign-in email.") from None
        raise IdentityLookupUnavailable("Directory lookup failed. Check Graph access and retry.") from None
    except Exception:
        # Avoid exposing tokens or remote response bodies in the UI or logs.
        raise IdentityLookupUnavailable("Directory lookup is unavailable. Retry or contact an administrator.") from None
    try:
        oid = UUID(data["id"])
        returned_upn = data["userPrincipalName"]
        if not isinstance(returned_upn, str) or returned_upn.casefold() != upn.casefold():
            raise ValueError("UPN mismatch")
    except (KeyError, TypeError, ValueError):
        raise IdentityLookupUnavailable("Directory returned an invalid user record.") from None
    return DirectoryUser(object_id=oid, user_principal_name=returned_upn)
