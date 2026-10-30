Copy the included backend files into the matching folders and restart FastAPI. No frontend change, database migration, .env change or hosted-agent redeployment is required: this changes the payload constructed in FastAPI, not the deployed agent's core instructions. Do not run the deployment pipeline just for this update.

Both EA Prepare question generation and preparation chat now receive only:
- Project name
- Business function
- Problem Statement
- Value Description
- Desired Business Outcome

Demand ID still identifies the correct project in the API and database, but is no longer automatically sent in project context. The complete intake stays in SQL. Stakeholders/emails, sourceFields, repeated narratives, import metadata, other intake facts, null and whitespace-only fields are excluded by an explicit allowlist. Non-empty narratives are sent verbatim, with no extra summarization/model call. The small intake-reported/unverified label is retained. Chat continues to receive its bounded user/assistant conversation history; this change does not strip information the user includes in chat.

The generation task prompt is shorter and requests up to eight concise questions, while retaining the required JSON response structure. Core agent instructions, model choice, token limits, reviewer permissions and meeting question persistence are unchanged. This also changes the input made by the local developer test_ea_agent script because it shares the same preparation payload builder.

Verification: from backend run `uv run python -m pytest tests/test_ea_agent_foundation.py tests/test_ea_preparation.py -q`. Tests cover the explicit allowlist, absent Demand ID, preserved narrative text, omitted empty fields, oversized payload rejection, installed MAF request handling and EA API access.

In the app, generate questions once and inspect the new Foundry request payload. Its project_context should contain only the five allowed non-empty fields. The supplied example shrinks from 17,767 to 1,797 context characters (about 90%). This is not a promised 90% billing reduction; compare actual input/output/reasoning-token usage for equivalent requests. Other facts remain in SQL but are not available to the agent in this minimal-context increment.
