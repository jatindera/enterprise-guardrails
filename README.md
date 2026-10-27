# Microsoft Graph identity lookup increment

Copy `backend/app/modules/projects/graph_identity.py` and `backend/tests/test_graph_identity.py` to the corresponding paths in the existing project. From the backend directory run `uv run python -m pytest tests/test_graph_identity.py -q` and then `uv run python -m pytest -q`.

This is a standalone, synchronous lookup helper. It accepts an injected Azure credential and looks up a user by sign-in UPN; it does not run automatically or modify assignments, endpoints, role checks, intake imports, or the UI. The caller must authorize its requester before using it and must use a credential from the configured tenant. The calling code will use AzureCliCredential for local development and ManagedIdentityCredential in Azure, explicitly selected by configuration; no Graph token or secret belongs in the frontend.

For local testing, the developer's Azure CLI sign-in must be to the correct tenant and have a delegated Graph token and directory-read permission appropriate to the request. Granting Graph permissions to the backend app registration does not automatically grant them to the Azure CLI identity. For deployed app-only access, the managed identity needs its own Microsoft Graph application permission; assigning an Azure subscription RBAC role is not sufficient.

Future work must atomically invalidate the old primary object ID when intake changes and only persist an ID returned by an authenticated Graph lookup. EA access remains enforced by matching the immutable tenant/object ID and current EA app role, not by matching UPN strings. This increment has not yet implemented that enforcement.
