# EA deployment diagnostics

The previous script hid the service message, so HTTP 400 alone cannot establish the root cause. This increment adds operation labels and allowlisted, bounded error code/message/target/details/request-ID output with common credential redaction. It preserves the original inference error if synthetic-session cleanup also fails.

1. Copy the included backend files over your matching project files. No .env, dependencies, migration, Dockerfile, or pipeline YAML change is needed.
2. From backend, run `uv run python -m pytest -q`.
3. Commit and push the update.
4. Start a NEW pipeline run against that updated commit. Retrying the old failed run uses the old checkout and will not pick up this diagnostic code.
5. If it fails again, share the `Deployment error: {...}` line and the nearby `Deployment operation:` lines. These show whether failure occurred in list_versions, create_version, get_version/wait_for_active, create_session, Responses inference, or cleanup.

Do not enable Azure CLI/SDK HTTP debug logging or print access tokens. The deployment settings and role assignments are unchanged. This is a diagnostic patch, not a claimed fix for the unknown 400 cause. Azure deployment must still be verified in your environment.
