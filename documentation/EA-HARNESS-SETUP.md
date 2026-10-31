# EA minimal harness and task profiles

This increment keeps one Enterprise_Architecture_Agent and introduces named, versioned task profiles for the two working operations: Prepare questions and preparation chat. FastAPI chooses the profile directly; no model call is used for routing.

The agent now uses MAF create_harness_agent with optional planning, file memory, compaction, web search and autonomous loops disabled. No skills, shell, file tools or background agents are configured. Execution history is request-scoped; it is not long-term learning or memory. Conduct meeting, Review meeting and diagram generation integrations remain future increments.

Core instructions version 1.0.0, existing task wording, compact project context, model deployment, output limit, API permissions and database question persistence are preserved. There is no additional model call and no promised cost reduction from this structural change alone.

## Apply

1. Copy the included backend folder into your existing project, preserving its paths.
2. In backend, run `uv run python -m pytest -q`.
3. Commit and push the changes. Run the full existing Azure DevOps agent pipeline so the new agent factory is built into the hosted container. Wait for deployment and smoke test success.
4. Set `APP_EA_AGENT_VERSION` in the backend .env to the newly successful Foundry version, then restart FastAPI. Use the actual version from your deployment rather than assuming a number.
5. Verify question generation and preparation chat in the UI. Check saved selections still load, regeneration preserves selected/manual questions, optional suggested questions work, and unauthorized users cannot edit.

No frontend changes, migrations, dependency upgrades, new Azure resources or Dockerfile changes are needed. The existing Dockerfile copies app/agents, including the new profiles module. The core instructions file is not replaced by this ZIP.

## Included files

- backend/app/agents/enterprise_architecture/agent.py
- backend/app/agents/enterprise_architecture/profiles.py
- backend/app/modules/ea_preparation/router.py
- backend/tests/test_ea_harness_profiles.py

## Validation

Full backend suite: 338 passed, 1 skipped, 3 subtests passed. Cloud calls were mocked; live Foundry deployment and UI checks must be performed through your pipeline and application.

Tests cover unchanged core instructions/output limits, disabled optional capabilities, isolated request history, one model request for ordinary question generation, versioned profiles, conversation serialization and input limits. Existing EA and authorization tests pass.

Reference: https://learn.microsoft.com/en-us/agent-framework/concepts/harness
