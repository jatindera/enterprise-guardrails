Replace azure-pipelines-ea-agent.yml at your repository root. Keep all previous backend fixes.
Commit, push, and start a new pipeline run.

Images are cached by Git content of backend/app/agents and backend/deployment/ea-agent. Agent code, instructions, Dockerfile and locked dependencies are covered. Pipeline/backend-only changes reuse the image. Existing deployment configuration fingerprinting still creates a version for runtime configuration changes.

First run can create one new version to establish the source-tagged image. Rerun unchanged source: expect "Agent build inputs unchanged" and the same Foundry version, with smoke testing still performed.

Cached image tags are protected against overwrite/deletion. To refresh the floating Python base image deliberately, change the Dockerfile (prefer pinning a reviewed new base image digest). Updating other build inputs requires maintaining the fingerprint paths.

Verified shell syntax and Git hash behavior for pipeline-only versus agent code changes. Azure execution must be verified through your next pipeline run.
