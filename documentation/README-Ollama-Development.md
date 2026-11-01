# Increment 1: Ollama development execution for the EA agent

Apply this patch on top of the latest EA transcript-only-context implementation. Extract into your project root and overwrite the included backend files. No database migration or hosted-agent redeployment is needed. Existing pinned dependencies already provide the MAF OpenAI-compatible client; no package additions are required.

This increment adds the model-provider choice. The agreed final EA assessment UI remains the next increment; it is not changed here.

## Choose a local model
Run on the same computer as your FastAPI backend:
    ollama list
Copy an exact downloaded LOCAL model name from that output. Do not select an Ollama cloud model. This patch does not download models.

Edit backend/.env (replace any existing execution-mode line):
    APP_EA_EXECUTION_MODE=ollama
    APP_OLLAMA_MODEL=YOUR_EXACT_LOCAL_MODEL_NAME
    APP_OLLAMA_BASE_URL=http://localhost:11434/v1
    APP_OLLAMA_MAX_OUTPUT_TOKENS=4000
    APP_OLLAMA_REQUEST_TIMEOUT_SECONDS=120

Restart FastAPI. Ollama must be running; if necessary start it with ollama serve, unless the desktop app is already serving port 11434. Frontend changes are not required.

## Modes
ollama: local FastAPI -> local MAF EA agent/harness -> Ollama on loopback.
local: local FastAPI -> local MAF EA agent/harness -> Azure Foundry model.
hosted: FastAPI -> deployed Foundry hosted agent -> Azure Foundry model.

The existing meaning of local is preserved: it still uses paid Azure inference. Choose ollama for local-model inference.
Switch back to APP_EA_EXECUTION_MODE=hosted and restart the backend for Azure testing, retaining your existing Foundry configuration and deployed version. Use explicit environment-specific configuration for production; do not copy the development Ollama setting into Azure.

## Shared behavior
Preparation questions, preparation chat, conduct-meeting chat and transcript review use the selected execution mode. Core EA instructions, task profiles, JSON validation and transcript citation checks are shared.
Review context remains minimal intake plus attached transcripts, without previous AI reviews or prepared questions.
New review metadata records execution_mode=ollama and agent_reference=ollama:<model>. A locally generated draft is not proof of Foundry output quality.

No Azure fallback occurs if Ollama fails. Search web is rejected before the existing Azure planner/search calls in Ollama mode; turn Search web off. Existing database, Blob storage and authentication services are unchanged and may still incur their normal charges. This change removes Foundry inference calls for the covered EA actions, not all Azure application usage.

The Ollama endpoint is deliberately restricted to HTTP loopback /v1. Cloud-tagged model names are rejected. Use a genuinely locally installed model; the app does not manage the Ollama server's own integrations. Docker/remote-backend access to host Ollama is not configured in this increment.

## Testing steps
1. Save the .env settings, start Ollama, and restart FastAPI.
2. With Search web OFF, send a short message in EA Prepare chat. Confirm an answer appears.
3. Generate preparation questions, then test Conduct meeting chat.
4. Upload a short transcript and run Review meeting with AI. A model may fail JSON/citation validation; validation is deliberately not relaxed.
5. Confirm a newly generated review has execution_mode=ollama and the expected model in SQL.
6. Confirm there are no new Foundry requests for these actions.
7. Select Search web: expect an explicit Ollama-mode message and no Azure search call.
8. Stop Ollama and submit another request: expect an error with no fallback to Azure.
9. Switch execution mode back to hosted, restart, and retest the same features on Foundry.

Start with short transcripts. Local model context capacity and JSON/citation reliability vary; configure sufficient context in Ollama for longer inputs. Application input limits do not establish the model's context capacity. Use Azure to evaluate final result quality, tool behavior and production performance.

## Validation
437 backend tests passed, 1 skipped, 3 subtests passed.
Includes a real MAF/OpenAI SDK chat-completion roundtrip with mocked HTTP, local routing, no Azure fallback, endpoint validation, web-search blocking and review metadata.
The user's actual Ollama installation was not reachable from this environment, so live local-model quality/performance are not claimed.
