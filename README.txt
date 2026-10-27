Security reviewer backend increment

Copy the backend folder contents over your project, preserving paths. Back up the three replaced files first. This package was based on your uploaded enterprise-guardrails.zip.

From backend, run: uv run alembic upgrade head; uv run python -m pytest -q

Primary Security sign-in email goes in the Security Resource Assigned intake field. Admin uses POST /api/projects/{demand_id}/security-primary-resolution with JSON {"expectedRevision": N}. Use GET /api/projects/{demand_id}/security-access to check permissions and PATCH /api/projects/{demand_id}/additional-security with {"expectedRevision": N, "email": "name@example.com"} to set the optional additional reviewer (null removes). Use authenticated API calls. A successful update advances revision; retrieve the latest project first.

This increment does not connect the Security screen or persist assessment conditions. An additional user must hold the security-engineer role at access time. No eligibility validation is performed when an email is added. An explicit Security reviewer field in a reimport clears the resolved primary identity; resolve it again as Admin.
