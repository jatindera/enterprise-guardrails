# EA assignment integration: development test

Copy the files in this update into the same paths in your existing project. The ZIP contains only the changed and new files; back up any changes made since the project ZIP you supplied. No new database migration is included: the earlier `20261027_ea_identity` migration must already be applied.

Run `uv run python -m pytest -q` from `backend`, and `npm run build` from `frontend`. The new backend tests use a fake directory resolver and SQLite. Run existing frontend tests as configured in your project as well. These complete-project checks have not been run in the authoring environment because dependencies could not be downloaded.

Run the backend in local mode after `az login --tenant <tenant-id>`. The CLI identity needs Microsoft Graph read access to the target users in that tenant. Use a test project whose Architect Assigned value is a sign-in UPN in the development tenant; production organization users may not exist in your personal tenant. The app resolves that UPN when an admin imports the intake. A missing or unavailable Graph user causes import to fail without saving. If a project was imported before this update, an admin can use `Resolve assigned architect` in EA assessment.

The optional additional architect is managed in EA assessment. Only the primary architect or Admin can save/remove it. The API compares validated Entra object IDs, requires the EA app role for non-admin users, re-checks permission after directory lookup, and uses project revisions for concurrency. Adding an email does not grant the target person an EA role: their signed-in access token must have it. Re-import with a new architect replaces the bound primary object ID.

In Azure hosting set `APP_ENVIRONMENT` to the deployment environment and configure the Graph application permission for the managed identity itself. If using a user-assigned identity, set `APP_GRAPH_MANAGED_IDENTITY_CLIENT_ID`. The Graph permission and SQL Azure RBAC are separate. Do not expose credentials to the browser.

EA assessment items, meeting data, decisions, and diagrams remain frontend-local prototype data. The assignment API enforces its own rules, but these local records are not a secure shared database; future EA write endpoints must check the same EA policy on the server. Security and RAI project-specific assignment enforcement is not implemented in this EA-only increment.
