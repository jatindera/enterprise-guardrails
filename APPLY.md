Copy the two backend files into your repository, replacing their existing versions.

From backend, run: uv run python -m pytest tests/test_ea_deployment.py -q

Commit and push, then run the pipeline again. The deployment script now reads the SDK enum value, so ACTIVE exits the wait loop and FAILED fails immediately. Matching existing releases can also be reused correctly.

No Azure resource, permission, database, or environment changes are needed. The agent container code is unchanged. A normal full pipeline run is fine; it may create a new version because it builds a new image. Do not retry the old run with its old source checkout.

Validated: 22 deployment tests passed, including actual installed SDK enum values.
