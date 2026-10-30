# EA Prepare: hosted agent integration

This increment connects EA Assessment > Prepare only. The left-hand generation button and right-hand chat call FastAPI, which checks the current Entra principal against SQL reviewer bindings, loads structured intake, and invokes the deployed MAF hosted agent. There is no local/demo fallback for these EA Prepare actions.

## Apply

1. Back up or commit your current project.
2. Copy the ZIP's `backend` and `fronend` contents into the corresponding existing folders. `fronend` matches the folder name in your uploaded ZIP; if your actual frontend folder uses another name, copy those files there.
3. Keep your existing `.env`. Add:

```dotenv
APP_EA_AGENT_NAME=enterprise-architecture-agent
APP_EA_AGENT_VERSION=3
```

Set the version to the successfully smoke-tested version shown in Foundry. It is deliberately pinned rather than following latest automatically. After a future agent release, update this setting when you want the app to use that version.

Keep the existing `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME=gpt-5.5`, and `FOUNDRY_AUTH_MODE=azure_cli`. See `backend/.env.ea-preparation.example`. Do not overwrite SQL, SSO or storage configuration.

4. Run `az login` using an account with Foundry invocation access. Restart FastAPI from `backend` with your usual command. Restart the Vite frontend.
5. No migration, new dependency, Azure resource, or agent redeployment is required. No pipeline files are changed.

In Azure, set `FOUNDRY_AUTH_MODE=managed_identity` for the backend and grant its managed identity Foundry User access on the Foundry project. Set `FOUNDRY_MANAGED_IDENTITY_CLIENT_ID` only for a user-assigned backend identity; omit it for a system-assigned identity. This backend identity is separate from the hosted agent's runtime identity. Existing model access for the hosted agent remains in place. Do not set both EG_AGENT_AUTH_MODE and FOUNDRY_AUTH_MODE to conflicting values; the existing settings prefer EG_AGENT_AUTH_MODE when present.

## UI test

1. Sign in as assigned EA, additional EA with the EA role, or Admin. Open a project with structured intake, then EA assessment > Prepare.
2. Click Prepare questions with AI. Expect a loading state, then project-relevant questions. None should be selected. Select one, switch to Conduct meeting, and confirm it is available for use.
3. Add a manual question. It should also start unselected and retain its different visual styling.
4. In the preparation chat, ask `Summarize this project's desired business outcome and identify the two biggest information gaps.` Verify the response against intake.
5. Ask a follow-up referring to that answer. Chat sends its bounded conversation history along with fresh SQL intake. When a proposed question appears, click Add to meeting questions; it remains unselected until explicitly selected.
6. Clear chat starts a new local conversation. Requests over 20 history messages or 12,000 combined characters are rejected with a request to clear chat.
7. Sign in as an unrelated EA or a general user: Prepare must be read-only. Direct API calls must return 403. An additional EA without the EA role must also be denied.
8. Temporarily set an invalid APP_EA_AGENT_VERSION, restart the backend and try again: expect a visible error, no sample reply, and the chat draft retained. Restore the correct version and restart.

The backend must have access to Foundry. If a request fails, check the backend request ID/logs, the pinned version, Azure CLI login or managed identity, and project RBAC. Error messages do not expose intake, prompts or Azure response bodies. First requests may take longer while the hosted runtime starts.

## Scope and behavior

- Questions and chat remain workspace drafts; refresh clears them. This increment does not add database persistence for these drafts.
- Each request uses an isolated, version-pinned hosted session. Chat continuity comes from explicitly supplied history, not browser-controlled Foundry session or response IDs. The backend stops its session after inference, including failures. Cleanup failures are logged by exception type and the configured Foundry idle timeout remains a fallback.
- The browser never sends authoritative project context. FastAPI loads it from SQL after checking assignment permissions.
- AI JSON is validated before being returned to the browser. Invalid or incomplete output is an error, never silently converted into a demo result.
- Existing questions are preserved when generating another set; duplicate text is skipped.
- Security, RAI and Conduct meeting retain their existing demo behavior. No approval, closure or reviewer-assignment rules change.
- APIM integration remains a later increment as planned. This calls the existing Foundry hosted endpoint directly through the backend.

## Automated verification

From `backend`: `uv run python -m pytest -q`.
From the frontend folder: `npm run build` and `npx vitest run`.

Verified in the supplied project: 318 backend tests passed, one skipped, three subtests passed. All 100 frontend tests passed. The production frontend build passed. Tests mock Foundry calls; verify live Azure behavior through the UI steps above.

Official session reference: https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/manage-hosted-sessions?pivots=python
