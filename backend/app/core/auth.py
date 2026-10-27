"""Validate Entra v2 API access tokens. No local authentication bypass."""
from typing import Annotated

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings

APP_ROLES = frozenset({
    "Admin", "enterprise-architect", "security-engineer", "rai-manager", "general-users",
    "arb-core-team",
})
bearer = HTTPBearer(auto_error=False)


def unauthorized() -> HTTPException:
    return HTTPException(401, "A valid API access token is required.", headers={"WWW-Authenticate": "Bearer"})


class TokenVerifier:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.issuer = f"https://login.microsoftonline.com/{settings.entra_tenant_id}/v2.0"
        self.keys = PyJWKClient(
            f"https://login.microsoftonline.com/{settings.entra_tenant_id}/discovery/v2.0/keys",
            cache_jwk_set=True, lifespan=3600, timeout=10,
        )

    def verify(self, token: str) -> dict:
        try:
            # Reject other algorithms before doing any key lookup. Pass the raw
            # RSA public key to decode, never a token-selected algorithm.
            if jwt.get_unverified_header(token).get("alg") != "RS256":
                raise unauthorized()
            key = self.keys.get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token, key, algorithms=["RS256"],
                audience=self.settings.entra_api_client_id,
                issuer=self.issuer, leeway=30,
                options={"require": ["exp", "iat", "nbf", "iss", "aud", "tid", "oid", "sub"]},
            )
        except PyJWKClientConnectionError as exc:
            raise HTTPException(503, "Sign-in verification is temporarily unavailable. Please retry.") from exc
        except jwt.PyJWTError as exc:
            raise unauthorized() from exc

        if claims.get("ver") != "2.0" or claims.get("tid") != self.settings.entra_tenant_id:
            raise unauthorized()
        if claims.get("azp") != self.settings.entra_frontend_client_id:
            raise HTTPException(403, "This client application is not permitted.")
        scopes = claims.get("scp")
        if not isinstance(scopes, str) or "access_as_user" not in scopes.split():
            raise HTTPException(403, "The access_as_user delegated permission is required.")
        roles = claims.get("roles", [])
        if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
            raise HTTPException(403, "Invalid application role assignment.")
        roles = sorted(APP_ROLES.intersection(roles))
        if not roles:
            raise HTTPException(403, "An application role assignment is required. Contact an administrator.")
        return {
            "objectId": claims["oid"],
            "name": claims.get("name") or claims.get("preferred_username") or "Signed-in user",
            "username": claims.get("preferred_username", ""),
            "roles": roles,
        }


def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    # A synchronous dependency keeps blocking JWKS retrieval off the event loop.
    return request.app.state.token_verifier.verify(credentials.credentials)


def require_admin(user: Annotated[dict, Depends(current_user)]) -> dict:
    if "Admin" not in user["roles"]:
        raise HTTPException(403, "Administrator access is required.")
    return user
