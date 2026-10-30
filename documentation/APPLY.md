# Fix reserved hosted-agent environment variable

Foundry rejected AGENT_HOST_BIND because the AGENT_* and FOUNDRY_* namespaces are reserved for platform use. The custom bind address is now EG_HOST_BIND in the deployment definition, Dockerfile, and host entry point. No resource, model, role, or identity change is needed.

1. Copy the included backend files into the corresponding project paths.
2. Run `uv run python -m pytest -q` from backend.
3. Commit and push all included changes.
4. Start a NEW complete pipeline run against that commit, including Build. The image MUST be rebuilt because its host code and Dockerfile changed. Do not reuse the image from runs 548/549 or retry their deployment stages.
5. Keep the existing ACR and registry connection parameters.

If your local environment explicitly sets AGENT_HOST_BIND for this application, rename that setting to EG_HOST_BIND. Existing local .env files normally have no bind setting and need no edit.

This corrects the confirmed invalid_payload error. Live deployment and smoke-test success still require verification in your Azure subscription; retain the diagnostics for any further service error.
