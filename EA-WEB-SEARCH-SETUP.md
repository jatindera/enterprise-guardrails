# Optional EA preparation web search

## Apply and run

1. Copy the included backend and frontend files into your current project, preserving paths. This increment assumes the previous local/hosted execution increment is installed, as it is in your uploaded code.
2. Restart FastAPI and the frontend. No database migration, dependency upgrade, hosted-agent version change or agent-container pipeline deployment is needed for this increment.
3. Open EA Assessment > Prepare > preparation chat. Select Search web, enter a public technical query and send your chat message. For example:
   - Chat message: What are the top two published vulnerabilities of this SDK? Separate confirmed advisories from general risks.
   - Public technical search query: Microsoft Agent 365 SDK published security advisories
4. Repeat in both APP_EA_EXECUTION_MODE=local and hosted. Ordinary chat and Prepare questions should continue to work with Search web off.

The uploaded ZIP calls its frontend folder `fronend`. This deliverable uses the correct `frontend/` prefix. Copy these files into the actual frontend project containing your package.json; do not create a second frontend application by mistake.

## Design and flow

Authorized chat request -> explicit public query -> shared web-evidence adapter -> compact evidence and provider source URLs -> existing EA task -> local or hosted EA execution -> Pydantic validation -> response and source links.

The adapter uses MAF FoundryChatClient.get_web_search_tool and get_response against your Foundry model. It is a reusable tool adapter, not another deployed agent. It intentionally runs before the EA agent so search never receives project context or conversation history. The existing EA agent still answers using its project context and the supplied evidence. In hosted mode the main EA response still comes from your pinned hosted-agent version; the public research step is orchestrated by FastAPI in both modes.

Only the reviewer-entered public query is supplied as search input. It is not automatically extracted from intake or chat. Do not include internal names, confidential data or secrets in this field. Validation blocks blank/overlong queries, email addresses, URLs, IP addresses and common Windows paths; it is not a general-purpose sensitive-data detector. Public search is backed by Bing, whose data handling differs from the private project context boundary.

Source links come from provider citation annotations, not URLs invented by the final EA response. HTTPS links are validated, and sources open in a new tab. A web-searched badge and timestamp identify searched replies. Empty citation results are explicitly marked unverified. Official sources are preferred through instructions; this is not a hard domain allowlist or a guarantee that every claim is correct. Review findings and affected versions before relying on them.

## Azure and model configuration

The native web tool uses Microsoft-managed Bing grounding; no separate Bing resource, key or toolbox is provisioned by this increment. A supported Azure OpenAI model deployment and regional web-search availability are required. Your backend identity must have project/model access (Azure CLI identity locally, managed identity when deployed).

By default, public research uses FOUNDRY_MODEL_DEPLOYMENT_NAME. To choose a different, cheaper supported deployment only for public research, set the following to its exact existing deployment name and restart FastAPI:

```dotenv
APP_EA_WEB_MODEL_DEPLOYMENT_NAME=your-mini-deployment-name
```

This does not create a model deployment or change the main EA model. The included backend/.env.ea-web.example documents the optional setting. No new .env value is required if your existing model supports web search.

If Azure blocks web search at subscription level, your Azure administrator can inspect the feature:

```powershell
az feature show --namespace Microsoft.CognitiveServices --name OpenAI.BlockedTools.web_search --subscription YOUR_SUBSCRIPTION_ID
```

If it is registered, web search is blocked. An authorized administrator can enable it by unregistering this blocking feature, subject to your organization's policy:

```powershell
az feature unregister --namespace Microsoft.CognitiveServices --name OpenAI.BlockedTools.web_search --subscription YOUR_SUBSCRIPTION_ID
```

This is a subscription-wide setting, not an application-only switch. Do not change it merely to troubleshoot an unrelated model/region or permission error. Web search failures show an error; the app never silently substitutes an ungrounded answer.

## Cost and limits

Search web defaults off and is only offered in connected EA preparation chat. Question generation never searches. Opted-in requests make one bounded research-model request with max_tool_calls=1, low search context and at most 1200 output tokens, followed by the existing EA response request. Both inference and search charges may apply. A single hosted tool invocation can involve provider-managed search activity; this is not a guarantee of one Bing billing transaction. No automatic application retry or research loop is added.

The public query is limited to 240 characters. Long conversations are rejected before paid search; clear chat or shorten the message if asked. Evidence output is bounded to 6000 characters and at most 8 sources. Existing main-EA limits remain unchanged. Chat, search metadata and source lists remain workspace drafts and clear on refresh; this increment does not add DB persistence for chat.

## Validation

Backend: 372 passed, 1 skipped, 3 subtests passed. Frontend: 113 passed across 16 files. Production frontend build passed (existing bundle-size warning remains). Azure calls were mocked; live subscription/model compatibility and UI checks must be run in your environment.

Tests cover authorization before search, no search for ordinary chat/question generation, public-query isolation, required query validation, source URL safety, provider citations overriding model-supplied sources, one native-tool invocation limit and no silent fallback.

References checked during implementation:
- https://learn.microsoft.com/en-us/agent-framework/agents/providers/microsoft-foundry
- https://learn.microsoft.com/en-us/agent-framework/agents/tools/web-search
- https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/web-search
