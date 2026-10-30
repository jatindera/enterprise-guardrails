# Microsoft source checks — 30 October 2026

## Decisions

- Use MAF Agent + FoundryChatClient for the application-owned agent definition and model inference.
- Use ResponsesHostServer to expose that code through Foundry's hosted Responses protocol. Local execution alone does not create a hosted resource.
- Pin agent-framework-core 1.23.0, agent-framework-foundry 1.15.0, and agent-framework-foundry-hosting 1.0.0b261022. Confirmed with current PyPI metadata and exercised using installed packages; hosting integration remains prerelease.
- Keep per-request agent state separate. The host owns outer Responses history; model-service storage is disabled. Project/user session ownership will be enforced by the future application endpoints.
- Use AzureCliCredential locally and ManagedIdentityCredential in cloud mode, including Foundry's hosted agent identity token service.
- Do not add a workflow for a single EA consultation, retrieval tools without sources/permissions, or approval actions.

## Primary sources

- [Foundry model provider](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/model-providers/microsoft-foundry) — Agent/FoundryChatClient pattern, imports, concurrency guidance.
- [Foundry hosted agents](https://learn.microsoft.com/en-us/agent-framework/hosting/foundry-hosted-agent) — Responses protocol, request factories, lifecycle/history, hosting package status.
- [Host MAF agents in Foundry](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/framework-hosted-agents) — hosting package and local protocol setup.
- [Hosted token service](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agent-token-service) — explicit ManagedIdentityCredential and agent identity selection.
- [Agent identity concepts](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/agent-identity) — separation of project/agent identities and authorization.
- [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent) — deployment lifecycle, Linux/amd64 requirement, PYTHONNOUSERSITE setting.
- [MAF Foundry package](https://pypi.org/project/agent-framework-foundry/) — installed integration dependencies and provider behavior.
- [MAF Foundry hosting package](https://pypi.org/project/agent-framework-foundry-hosting/) — prerelease and host/session behavior.
- [MAF core package](https://pypi.org/project/agent-framework-core/) — current core distribution.

Installed SDK inspection additionally verified constructor parameter names, max_tokens → max_output_tokens translation, credential handling, and resource shutdown behavior. A mocked OpenAI Responses return was processed through the real Agent/FoundryChatClient implementation; it did not call Azure.
