# EA hosted agent — Azure DevOps Dev deployment

## What this increment adds

Manual Azure DevOps pipeline: validate backend → build/push image → deploy hosted Dev version → wait for active → invoke a version-pinned smoke test → stop its synthetic session.

Uses existing service connection `sc-enterprise-guardrails-dev`, resource group `rg-enterprise-guardrails-dev`, region `southindia`, Foundry endpoint `https://eg-foundry-main.services.ai.azure.com/api/projects/enterprise-guardrails`, model deployment `gpt-5.5`.

Azure resource name: `enterprise-architecture-agent`. Foundry resource names require hyphens rather than underscores. The MAF name in the code remains `Enterprise_Architecture_Agent`.

This ZIP is a changed/new-file increment after EA-Agent-Foundation.zip. No database migration or frontend change is needed. Nothing has been deployed in your subscription by this work.

## 1. Create Azure Container Registry

Suggested name: `egguardrailsacrdev`. It must be globally available; if unavailable, choose a suffix and supply that name when running the pipeline. Reuse an existing suitable registry if you already have one.

Run in PowerShell, with the correct Azure subscription selected:

```powershell
az acr check-name --name egguardrailsacrdev
az acr create --resource-group rg-enterprise-guardrails-dev --name egguardrailsacrdev --location southindia --sku Basic --admin-enabled false --role-assignment-mode rbac
az acr config authentication-as-arm update --registry egguardrailsacrdev --status enabled
```

Only run create after check-name reports availability. Basic is sufficient for this initial Dev registry. This creates a billable registry. Image access is authenticated; enabling its network endpoint does not make images anonymous/public. No registry username/password is used. Foundry currently requires ACR's authentication-as-ARM policy to be enabled.

This guide explicitly uses RBAC Registry Permissions. If using an existing ABAC-enabled registry, do not change its permission mode casually: use Container Registry Repository Writer/Reader instead of AcrPush/AcrPull, with conditions covering this repository. The Azure CLI loginServer returned by the registry is used; the pipeline does not guess its DNS name.

## 2. Configure Azure permissions once

In Azure DevOps, open Project settings → Service connections → sc-enterprise-guardrails-dev. Use its Manage service principal link to identify the Enterprise application/service principal. Grant Azure roles to that principal, not your frontend/backend application registrations.

| Identity | Role | Scope |
| --- | --- | --- |
| Dev pipeline service principal | AcrPush | Dev registry |
| Dev pipeline service principal | Foundry Project Manager (older display: Azure AI Project Manager) | Existing Foundry project |
| Foundry PROJECT managed identity | AcrPull | Dev registry |
| Foundry PROJECT managed identity | Foundry User (older display: Azure AI User), if not already assigned | Parent Foundry account |

Contributor from the service connection does not grant Foundry or ACR repository data-plane access. Your own Azure administrator account needs role-assignment permission to grant these roles. The deployment script does not create role assignments or request Owner access for the pipeline.

Find the PROJECT principal under your Foundry project resource → Identity. This image-pull identity is distinct from the hosted agent's runtime identity. Hosted agent identity is provisioned automatically when creating the hosted resource; no manual managed identity is created by our script.

Allow time for new assignments to propagate before the first run. If your local role names still have Azure AI prefixes, select the corresponding current/previous name.

In Foundry's project management/connected resources, check the registry connection. For ACR already reachable using the project's default identity, the SDK permits omitting registry_connection_id; leave the pipeline parameter `registryConnection` at `none`. If your project uses an explicit registry connection, enter that connection's name/ID in the parameter. Configure it with identity access; do not enable ACR admin passwords for this pipeline.

Verify your Foundry project's existing Application Insights/Log Analytics connection. Reuse it if present. If absent, configure a workspace-based Application Insights resource and its workspace (suggested names appi-enterprise-guardrails-dev and log-enterprise-guardrails-dev, in the same Dev resource group/region), and connect Application Insights to the Foundry project. Telemetry resources can incur ingestion/retention charges. The agent keeps prompt/response content capture disabled by default; the pipeline never writes model response text or access tokens to its artifacts.

## 3. Prepare Azure DevOps environment

In Pipelines → Environments, create `enterprise-guardrails-dev` with no attached compute resource.

Under its Approvals and checks, add an Exclusive lock. The YAML's sequential lock behavior relies on this check; YAML alone does not create it. Serialize deployments and avoid running a separate manual version writer at the same time.

Keep the service connection restricted to the specific pipeline. Authorize it for this pipeline when prompted. Review which branches/users can deploy; do not grant deployment access to untrusted pull requests. No automatic PR or push deployment is enabled in this increment.

## 4. Apply source files

- Copy this ZIP's `backend` contents into your existing backend directory, keeping other files.
- Put `azure-pipelines-ea-agent.yml` at the repository root, beside the backend and frontend folders.
- Existing .env values can remain as they are.

From the backend directory:

```powershell
uv sync --locked
uv run python -m pytest -q
```

An explicit azure-ai-projects==2.7.0 dependency pins the SDK used for deployment. New hosted-runtime aliases MODEL_DEPLOYMENT_NAME and EG_AGENT_AUTH_MODE are supported; your existing local FOUNDRY_* settings still work. The hosted definition avoids setting platform-reserved FOUNDRY_* environment variables. Docker inherits the runtime's injected project endpoint.

Commit and push the changed files, including the lockfile and pipeline YAML, to your existing repository. Azure Pipelines can use either Azure Repos or your connected GitHub repository; no repository move is required.

## 5. Create and run the pipeline

1. Azure DevOps → Pipelines → New pipeline.
2. Select your existing repository provider and repository.
3. Choose Existing Azure Pipelines YAML file → `/azure-pipelines-ea-agent.yml`.
4. Save. When ready, choose Run pipeline on your reviewed branch.
5. Enter your actual Dev ACR name (default egguardrailsacrdev).
6. Leave registryConnection=`none` unless your project requires an explicit existing registry connection.
7. Authorize access to the service connection and environment for this pipeline if prompted.

Microsoft-hosted Ubuntu workers build the Linux/amd64 container. You do not need Docker Desktop locally for this pipeline. Your organization needs an available Microsoft-hosted parallel job; if Azure DevOps reports no hosted parallelism entitlement, request the available grant or use a suitable self-hosted Linux worker. Do not buy extra capacity automatically.

The pipeline does not create/recreate your Foundry account, project, model deployment, SQL, storage, APIM, or Production resources.

## 6. Expected result

- Validate: backend tests pass; JUnit results published.
- Build: image pushed with a build-specific tag; `ea-agent-release/image-manifest.json` records its immutable digest, source commit, and build ID.
- DeployDev: hosted version reaches active; smoke request uses an explicitly created session pinned to that version; completed non-empty response checked; only that synthetic session is stopped.
- `ea-agent-deployment/deployment.json` records the deployed version and smoke status. A pending smoke status is not a passed release. If deployment fails before the version is active, use the printed version/status in Foundry to diagnose it.

The smoke prompt contains no customer/project data and checks availability, not full EA answer quality. No intake or application SQL is needed in the hosted image.

If build push fails with denied/unauthorized, check AcrPush for the service-connection principal. If provisioning fails on image pull, check project MI AcrPull, registry connection/policy, and image reference. If agent creation/invocation returns 403, check Foundry project roles. Logs retain the error class/HTTP status rather than potentially sensitive response bodies.

Model inference and hosted compute are billable. Dev uses 1 CPU / 2GiB and a 120-second session idle timeout. Its smoke session is stopped immediately; ACR and any configured logging services have separate costs. This pipeline does not delete user sessions or old agent versions.

## Release and Production readiness

The same Python deploy command accepts another project endpoint, model deployment, and image manifest. Image digest is the artifact to promote; do not rebuild the source for Production. If Production uses a separate registry, copy the image and verify the resulting digest before registration.

This YAML intentionally contains only Dev. Before enabling Production, configure a separate Production service connection and environment, approvals/checks, image access, model availability, and endpoint version pinning/explicit promotion. Foundry's default endpoint follows latest released versions; this Dev script creates a released version, so it must not be pointed at Production unchanged. Production candidate validation, routing promotion, and rollback will be implemented against the Production environment at that increment. Prior versions/images are preserved.

A deployment-task retry can reuse an identical latest version; it does not silently redeploy an older matching version while another version is current. The environment lock prevents competing pipeline deployments, but does not coordinate unrelated external deployment tools.

Actual Azure DevOps execution, Docker build, and Azure deployment must be verified in your environment. Local validation uses installed SDK models, mocked cloud operations, parsed YAML, and Bash syntax checks.
