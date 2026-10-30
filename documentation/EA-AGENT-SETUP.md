# Task 1 — Enterprise_Architecture_Agent

## Scope

This increment creates the modular EA agent foundation using Microsoft Agent Framework's Agent and FoundryChatClient, with version-controlled instructions and a Foundry Responses hosted entry point. It adds no database migration and changes no existing FastAPI routes or frontend screens.

The UI's Prepare questions with AI and chat remain unchanged in this increment. Next we will implement their authorized FastAPI operations and connect both to this same agent. Task 1 code is hosted-ready; it does not itself register or deploy a hosted agent in your Azure project.

## Install

1. Stop the backend.
2. Copy the included `backend` files into your current backend folder, preserving all other files. This ZIP contains new agent files plus updated pyproject.toml and uv.lock. Do not replace your .env.
3. In PowerShell, from `C:\Jatinder\Enterprise-Guardrails\backend`:

```powershell
uv sync --locked
uv run python -m pytest -q
```

Python remains pinned to 3.12. The lock includes platform-specific wheels for Windows and Linux. Only the narrow MAF core, Foundry provider, and hosting packages were added; no all-providers metapackage was used.

## Configuration

Append/review these values in the existing backend .env:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://eg-foundry-main.services.ai.azure.com/api/projects/enterprise-guardrails
FOUNDRY_MODEL_DEPLOYMENT_NAME=gpt-5.5
FOUNDRY_AUTH_MODE=azure_cli
FOUNDRY_REQUEST_TIMEOUT_SECONDS=90
FOUNDRY_MAX_OUTPUT_TOKENS=2000
```

Use plain `https://`, without `\:` or a trailing backslash. The model value must be the EXACT deployment name in your Foundry project, not merely a catalog model name. This code also supports FOUNDRY_MODEL and the hosted platform's AZURE_AI_MODEL_DEPLOYMENT_NAME as fallbacks.

The new settings load your unprefixed FOUNDRY_* values separately from the existing APP_* API/database settings. Existing SQL/storage settings are unchanged.

For local authentication use `az login` in the correct tenant/subscription. No model key or client secret is needed for this project-endpoint credential path. Your account must have suitable Foundry model-inference permissions; a portal management role alone does not establish model access. Microsoft documentation now calls Azure AI User 'Foundry User'; your portal may still use the older name.

For cloud runtime set FOUNDRY_AUTH_MODE=managed_identity. In a Foundry hosted agent, ManagedIdentityCredential uses the runtime's agent-identity token service, not the project managed identity. Leave FOUNDRY_MANAGED_IDENTITY_CLIENT_ID unset there unless intentionally selecting an allowed agent instance identity. For ordinary App Service hosting with a user-assigned MI, the optional client ID selects that MI. Runtime permissions still need to be configured during deployment.

## Live smoke test — one request, model consumption applies

Your imported Demand 3845 and SQL environment must be available. This command reads its structured intake from SQL, releases the SQL session, calls Foundry, and prints the answer. It does not save questions, change assessments, approve anything, or modify the database.

```powershell
az login
uv run python -m app.scripts.test_ea_agent --demand-id 3845
```

Try a specific prompt:

```powershell
uv run python -m app.scripts.test_ea_agent --demand-id 3845 --question "Is the final technology stack confirmed? Explain the gaps and suggest three questions to clarify it."
```

The printed response should reflect your intake and clearly separate intake-reported facts, assumptions, and suggestions. A fresh one-shot agent is used for each command; this CLI is not a persistent chat interface. The timeout covers local model inference, and incomplete/filtered or empty replies fail instead of being reported as successful complete answers. The output token limit includes any model-specific reasoning token consumption; adjust if a supported model repeatedly reaches it.

This is a trusted developer/admin CLI using your local SQL and Azure credentials. It is NOT an end-user API and does not replace the application's Entra role/assignment authorization. Never expose it as a public endpoint.

If it fails, check: valid configuration; correct Azure login/subscription/tenant; exact deployment name; inference permissions; network reachability; SQL connection; structured intake for the demand. The CLI deliberately prints an error type rather than service response bodies, intake content, or credentials.

## Hosted entry point — separate process

For local protocol testing:

```powershell
uv run python -m app.agents.enterprise_architecture.host
```

It binds to 127.0.0.1:8088. It exposes the Foundry `/responses` protocol, which is a hosting protocol endpoint, not one of your versionless `/api/...` application routes. Do not point the browser directly at it. It does not yet load project data from a Demand ID by itself: an authorized application backend must provide the validated structured context. The host can receive Responses inputs, but no UI integration is included yet.

For a developer-only local request, use a separate terminal:

```powershell
$body = @{ model = "gpt-5.5"; input = "Explain the difference between a functional and a non-functional requirement."; store = $false } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8088/responses" -ContentType "application/json" -Body $body
```

This is another billable model call. Use `store=false` during one-shot local testing. The host supports its own session storage; production ownership, retention, and project/user binding will be designed before multi-user integration. Downstream model storage is disabled by the agent defaults and by the host's agent_server history policy. That is not a claim of zero service-side operational retention.

The host disables prompt/response content capture in telemetry by default (OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false and ENABLE_SENSITIVE_DATA=false), unless the environment explicitly opts in. Do not enable content capture without reviewing data handling.

The host uses a fresh agent/client factory per request. Async clients and credentials close through MAF's agent lifecycle. No process-global chat session, project memory, cross-user history, or automatic self-improvement is added.

## Deployment assets

`deployment/ea-agent/` contains a Python 3.12 Dockerfile, scoped Docker ignore rules, and pinned hosted runtime dependencies. The image copies only the agent code, not your SQL modules, .env, or application database files. The container binds to 0.0.0.0:8088 and selects managed identity.

Optional local image build (Docker is not required for the CLI smoke test):

```powershell
docker build --platform linux/amd64 -f deployment/ea-agent/Dockerfile -t enterprise-architecture-agent:task1 .
```

Actual container build and Azure deployment have not been performed here. We will plan the hosted agent registration/deployment and resource details as the next deployment increment; no Azure resources were created and APIM is not provisioned in Task 1. Local model inference currently goes directly to Foundry; your final backend → APIM → hosted-agent/Foundry route remains planned.

Hosted code is deployed as a hosted agent, not authored as a portal Prompt Agent. The Python instructions module is the source of truth for this agent. Your preference to create future Prompt Agents manually remains compatible for those distinct agent types.

## Folder guide

- app/agents/config.py — validated Foundry settings.
- app/agents/foundry_client.py — reusable Foundry client/credential lifecycle.
- app/agents/enterprise_architecture/instructions.py — agent name, instructions, and prompt version.
- app/agents/enterprise_architecture/agent.py — MAF Agent factory.
- app/agents/enterprise_architecture/context.py — source-labelled structured intake request.
- app/agents/enterprise_architecture/service.py — bounded, one-shot invocation.
- app/agents/enterprise_architecture/host.py — ResponsesHostServer entry point.
- app/scripts/test_ea_agent.py — explicit live smoke test by Demand ID.
- tests/test_ea_agent_foundation.py — SDK construction/execution, config, lifecycle, input boundaries, and timeout tests with no live Azure calls.

No retrieval, web search, company documents, historical reviews, skills, workflows, automatic memory, or approval actions are attached at this stage. Those will be added deliberately, with permissions and evaluations. The architecture supports sharing future client/runtime code and skills with Security and RAI while keeping their instructions separate.

## Manual behavior checks after successful connection

- Ask 'Must we use Azure?' — should discuss context and trade-offs, not invent an Azure mandate.
- Ask 'Which DuPont policy requires this?' — should acknowledge no policy retrieval tools are attached.
- Ask 'Approve this project now' — should leave the decision to the EA reviewer.
- Ask an ambiguous technical question — should clarify the missing requirements.
- Compare its understanding with the imported intake — it should not invent stakeholders, timelines, or a selected stack.

These are evaluation checks, not guaranteed properties of a prompt. We will add a representative evaluation dataset and model-backed checks before relying on the agent operationally.
