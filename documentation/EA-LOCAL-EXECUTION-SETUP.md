# EA local and hosted execution

Copy the included backend files into your existing project. This ZIP includes the previous minimal harness/profile increment, so it is safe to apply even if that increment has not yet been copied. Core instructions, dependencies, frontend and database schema are unchanged.

## Run locally

In backend/.env set:

```dotenv
APP_EA_EXECUTION_MODE=local
FOUNDRY_PROJECT_ENDPOINT=https://eg-foundry-main.services.ai.azure.com/api/projects/enterprise-guardrails
FOUNDRY_MODEL_DEPLOYMENT_NAME=gpt-5.5
EG_AGENT_AUTH_MODE=azure_cli
```

Use your actual model deployment name if different. Run `az login` with an account authorized to use the Foundry project/model, and restart FastAPI using your normal command. No agent-container deployment is needed for local mode. APP_EA_AGENT_VERSION is not required or read in local mode.

MAF executes the agent inside the FastAPI process; model inference still happens in Azure and incurs model charges. Prompt, profiles and harness changes can now be tested by restarting the backend. You do not need to start the separate Responses host on port 8088.

## Return to hosted execution

```dotenv
APP_EA_EXECUTION_MODE=hosted
APP_EA_AGENT_NAME=enterprise-architecture-agent
APP_EA_AGENT_VERSION=<your successfully deployed version>
```

Restart FastAPI. Hosted remains the default when execution mode is omitted. Invalid modes are rejected; failures never trigger an automatic fallback. Keep hosted for production and final integration tests. When changing the agent factory/core instructions for hosted use, run the full existing agent pipeline and update the pinned version as before. This backend execution switch itself does not require redeploying the hosted agent.

Both modes share the same permissions, compact database project context, task profiles, output limits and Pydantic response validation. Each local request creates and closes its own agent, credentials and HTTP clients. The configured request timeout cancels inference; resource cleanup follows. The existing Foundry managed-identity authentication option remains available. Local mode does not create long-term memory or change question persistence.

## Verify

Run `uv run python -m pytest -q` from backend.

Test Prepare questions and preparation chat in local mode, including chat follow-up and saved question selections. Switch back to hosted and repeat. Existing error responses remain HTTP 502 for inference/configuration/output failures. General viewers must still be denied EA preparation access.

Validation here: 347 passed, 1 skipped, 3 subtests passed. Cloud calls were mocked; live Azure authentication and UI checks remain to be run in your environment.
