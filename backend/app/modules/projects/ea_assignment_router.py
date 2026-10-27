from typing import Annotated
from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel, ConfigDict, Field
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from sqlalchemy.orm import Session
from app.core.auth import current_user
from app.db.session import get_session
from app.modules.projects import ea_assignment
from app.modules.projects.graph_identity import resolve_upn

router = APIRouter(prefix="/api/projects", tags=["EA assignments"])


class EARevision(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    expected_revision: int = Field(alias="expectedRevision", ge=1, strict=True)


class EAAdditional(EARevision):
    email: str | None = Field(default=None, max_length=320)


def graph_resolver(request: Request):
    settings = request.app.state.token_verifier.settings
    if settings.environment == "local":
        credential = AzureCliCredential(tenant_id=settings.entra_tenant_id)
    else:
        credential = ManagedIdentityCredential(client_id=settings.graph_managed_identity_client_id)
    def lookup(upn):
        try:
            return resolve_upn(upn, credential)
        finally:
            credential.close()
    return lookup


@router.get("/{demand_id}/ea-access")
def ea_access(demand_id: Annotated[str, Path(pattern=r"^[0-9]{1,64}$")],
              session: Annotated[Session, Depends(get_session)],
              user: Annotated[dict, Depends(current_user)]):
    return ea_assignment.get_ea_access(session, demand_id, user)


@router.post("/{demand_id}/ea-primary-resolution")
def resolve_ea(demand_id: Annotated[str, Path(pattern=r"^[0-9]{1,64}$")], data: EARevision,
               session: Annotated[Session, Depends(get_session)],
               user: Annotated[dict, Depends(current_user)], resolver=Depends(graph_resolver)):
    return ea_assignment.resolve_primary(session, demand_id, data.expected_revision, user, resolver)


@router.patch("/{demand_id}/additional-ea")
def additional_ea(demand_id: Annotated[str, Path(pattern=r"^[0-9]{1,64}$")], data: EAAdditional,
                  session: Annotated[Session, Depends(get_session)],
                  user: Annotated[dict, Depends(current_user)], resolver=Depends(graph_resolver)):
    return ea_assignment.set_additional(session, demand_id, data.expected_revision, user, data.email, resolver)
