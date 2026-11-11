# Dedicated Security agent and assessment

Apply this overlay at the root of the checkout matching the supplied archive. It includes Security preparation, both chat phases, transcript-based AI review, human assessment, and manual PDF closing-report upload.

## Local verification

1. From `backend`, apply the database migration to your configured development database.

   ```powershell
   uv run --locked alembic upgrade head
   ```

2. Set Security's execution mode in the backend `.env`. Existing local Ollama model settings are reused.

   ```dotenv
   APP_SECURITY_EXECUTION_MODE=ollama
   ```

   `local` uses the Security agent with your configured Foundry model. `hosted` uses its own deployed agent and requires the version below.

3. Restart FastAPI and the frontend. Open a project as the assigned Security reviewer or an Admin and enter **Security assessment**.
4. In **Prepare**, generate Security questions and add a chat suggestion. Select one question for **Conduct meeting** and ask for a follow-up there.
5. In **Review meeting**, attach relevant TXT, VTT or Markdown transcripts, generate the advisory review, check the citations and accept the AI draft. Include all relevant transcripts when regenerating. Security review input supports up to 100,000 transcript characters with a separate serialized input budget. Saved AI versions retain the submitted text and citations.
6. In **Security assessment**, record risk, decision and rationale. Add conditions for conditional approval. Upload and select the Security team's PDF closing report when available. Save the draft, submit the decision, then reload and verify the submitted history and report. The primary Security reviewer or Admin submits and reopens decisions. Additional Security reviewers can prepare, accept AI drafts, save human drafts, and upload reports. The official Security system remains the source for organizational approval.

Report files use the backend's existing private artifact storage configuration. Chat history stays in the workspace. Save human edits before leaving the assessment tab.

## Hosted deployment

Build the Security image from the `backend` directory using `deployment/security-agent/Dockerfile`. Push it under a separate image repository such as `enterprise-security-agent`. Use the existing release helper with the Security image's digest and pass `--agent-name enterprise-security-agent` to the deploy subcommand.

```powershell
docker build -f deployment/security-agent/Dockerfile -t enterprise-security-agent .
# Set these variables to your actual registry, immutable image and Foundry deployment values.
docker tag enterprise-security-agent "${registry}/enterprise-security-agent:${buildId}"
docker push "${registry}/enterprise-security-agent:${buildId}"
# Set $imageDigestRef to the pushed full registry/repository@sha256:digest reference.
uv run --locked python -m app.deployment.ea_hosted manifest --image $imageDigestRef --source-commit (git rev-parse HEAD) --build-id $buildId --output security-release.json
uv run --locked python -m app.deployment.ea_hosted deploy --manifest security-release.json --output security-deployment.json --project-endpoint $projectEndpoint --model $modelDeployment --agent-name enterprise-security-agent
```

Set these backend values after provisioning and use the returned Security version number.

```dotenv
APP_SECURITY_EXECUTION_MODE=hosted
APP_SECURITY_AGENT_NAME=enterprise-security-agent
APP_SECURITY_AGENT_VERSION=<deployed Security version>
```

The Security host uses its own instructions and entry point. The existing EA deployment pipeline can continue deploying EA. Deploy Security separately using its own image and Foundry name.

## Knowledge and review feedback

- **SharePoint and Foundry IQ.** Keep knowledge access at the Security agent boundary. Add an authorized retrieval adapter that supplies relevant excerpts and source references. Keep policy evidence distinct from transcript evidence and general Security guidance. Return source identifiers for policy-backed suggestions, and validate them against the retrieval result. Project authorization and document authorization must both apply.
- **Learning from reviews.** The review history records AI drafts, accepted source versions, human edits, submitted decisions and report links. Use this history to build a reviewer-curated feedback set. Extract reusable lessons only after review, remove project-sensitive details, and evaluate changes against held-out scenarios before promoting guidance. The model does not train itself or read other projects' reviews in this release.

## Automated tests

```powershell
# From backend
uv run --locked python -m pytest -q tests/test_security_agent.py tests/test_security_preparation.py tests/test_security_reviews.py

# From frontend
npx vitest run src/SecurityReviews.test.tsx src/eaDomain.test.tsx src/preparationRoles.test.tsx
npm run build
```
