# EA web search: one chat input

Copy the included backend and frontend files into your current project and restart both applications. This ZIP includes the full optional-web-search increment plus the single-input correction, so it replaces the earlier EA-Optional-Web-Search.zip files. It assumes the local/hosted execution increment is already installed.

No database migration, dependency upgrade, new environment variable, or hosted-agent redeployment is required. The ZIP uses frontend/; copy into your actual frontend project containing package.json if your local folder is named differently.

## User flow

Type `top 2 vulnerabilities of Agent 365 SDK?` in the normal chat box, select Search web and press Send. There is no second textbox. Sources and the web-searched timestamp appear with the reply. If the product/topic is unclear, the assistant asks for clarification in the same chat; include the public product and technical topic in your next message.

## Backend flow

1. Existing EA permissions are checked.
2. A small tool-free query-preparation request receives only the current message, with obvious emails, URLs and keyed secrets scrubbed. It receives no intake, demand ID, project context or chat history.
3. Pydantic validates its public query or clarification. Clarification returns directly in chat without searching. Invalid output fails closed; the raw message is never used as a fallback query.
4. Only the prepared public query is sent to native Foundry web search, limited to one tool invocation and low search context.
5. The existing EA agent, in local or hosted mode, receives the evidence alongside its normal compact project context and returns the answer. Provider citation annotations supply the displayed links.

Automatic query preparation is best-effort filtering, not a guarantee that every sensitive detail can be detected. The UI asks users to exclude confidential details when requesting public research. Search results are untrusted evidence and do not issue EA approval or verify controls.

Search defaults off. Ordinary chat and question generation make no query-preparation or search calls. Opting in adds a query-preparation model request (maximum 512 output tokens), a bounded research request (maximum 1200 output tokens), and the normal EA response. Model and search usage charges apply. One built-in tool invocation is not a guarantee of one provider billing transaction.

To use a cheaper already-deployed, web-capable model for both query preparation and public research, optionally set:

```dotenv
APP_EA_WEB_MODEL_DEPLOYMENT_NAME=your-mini-deployment-name
```

Otherwise these steps use FOUNDRY_MODEL_DEPLOYMENT_NAME. The main EA model is unchanged. Messages over 2000 characters get an in-chat request for a shorter public question; long conversations may require clearing chat to stay within the evidence budget.

## Azure prerequisites

The native MAF FoundryChatClient web-search tool uses Microsoft-managed Bing grounding; no separate Bing resource/key is provisioned. A supported Azure OpenAI deployment/region, project/model access for the backend identity and subscription permission to use web search are required. Search queries cross the Bing public-search boundary; project context remains outside the search request.

If your administrator has blocked web search at subscription scope, consult Microsoft's administrator-control instructions before changing that subscription-wide policy:
https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/web-search

In hosted mode the public query-preparation/search steps still run from FastAPI; only the final EA response uses the pinned hosted agent. The main harness's automatic web search deliberately remains disabled. Local and hosted modes share this adapter.

## Validation

Backend: 377 tests passed, 1 skipped, 3 subtests passed. Frontend: 113 tests passed; production build passed with its existing bundle-size warning.

Cloud responses were mocked. Test live Azure search in both execution modes after installation. Also verify Search web off, unclear-product clarification, source links, permissions and saved question selections.
