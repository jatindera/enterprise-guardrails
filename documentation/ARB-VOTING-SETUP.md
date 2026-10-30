# ARB voting — install and test

This increment builds on RAI-Reviewer-Access.zip and ARB-Access-UI.zip. It contains only the changed files; copy them into the corresponding folders of Enterprise-Guardrails after backing up your project.

## What changes

- FastAPI reads the voter from the verified Entra token and requires the exact role value arb-core-team for every vote.
- Admin alone cannot vote. A core member does not need to be the project's assigned EA.
- Any signed-in application user can read combined totals and their own saved vote.
- Each person has one current vote per project. Updating a vote replaces its contribution to the totals and appends a history record.
- Voting against requires a nonblank reason, validated by the UI and API. The timestamp comes from the server.
- Duplicate and stale submissions cannot produce multiple counted votes. Vote and history writes are transactional.
- Results refresh after saving and every 15 seconds while the voting tab and workspace are open.
- Voting does not mark ARB completed or change EA approval.

## 1. Copy the files

Extract the ZIP outside your project, then merge its backend and frontend folders into your project, preserving paths. Do not replace or delete your .env files. No new Azure resources or credentials are needed.

The migration is backend/migrations/versions/20261028_arb_votes.py.

Its predecessor is 20261027_rai_additional. If your migration head differs, stop before applying it and share the output of uv run alembic heads.

## 2. Backend

From PowerShell:

    cd C:\Jatinder\Enterprise-Guardrails\backend
    uv sync
    uv run alembic upgrade head
    uv run python -m pytest -q

Restart the backend with your usual command. Tests use a disposable SQLite database; the migration applies to your configured Azure SQL database.

New endpoints (no API version prefix):

- GET /api/projects/{demand_id}/arb-voting
- PUT /api/projects/{demand_id}/arb-vote

Example write body:

    {
      "choice": "Against",
      "reason": "Please confirm the proposed integration control.",
      "expectedRevision": 0
    }

Use zero for the first vote. For updates use myVote.revision from the latest GET response. The UI handles this automatically. A 409 means the vote changed elsewhere and results must be refreshed.

## 3. Frontend

This package adds testing-library and jsdom as development dependencies and includes the updated package lock.

    cd C:\Jatinder\Enterprise-Guardrails\frontend
    npm ci
    npm run build
    npm run test:arb
    npm run dev

Production TypeScript compilation now excludes test files. The test:arb script runs the new ARB UI tests separately. Older preparation tests in src were already out of step with the current preparation UI; this increment does not rewrite or claim to validate that legacy frontend suite.

## 4. End-to-end verification

Use a project where ARB is applicable.

1. Sign in with a user assigned arb-core-team on the backend enterprise application. Sign out and back in if the role was recently added.
2. Open ARB review → Core Team Vote. Click Vote in Favour. Check the success message and server timestamp.
3. Refresh the browser and reopen the project. The saved vote and total must remain.
4. Vote Against, enter a reason, and confirm. This person should still be counted once, moving from In favour to Against.
5. Sign in as another core member in a separate browser profile and vote. Leave the voting tab visible in the first browser; totals should update within 15 seconds.
6. Sign in as an Admin without arb-core-team, an EA without the core role, or a general user. Totals should be visible and voting disabled.
7. Automated API tests verify direct unauthorized writes return 403 even if a caller bypasses the disabled UI.
8. Verify ADR document access still behaves as before. This package does not persist those documents.

## 5. Check Azure SQL

Current votes:

    SELECT p.demand_id, v.voter_object_id, v.choice, v.reason,
           v.revision, v.recorded_at
    FROM dbo.arb_votes AS v
    JOIN dbo.projects AS p ON p.id = v.project_id
    ORDER BY p.demand_id, v.recorded_at;

Vote history:

    SELECT p.demand_id, v.voter_object_id, h.revision, h.choice,
           h.reason, h.recorded_at
    FROM dbo.arb_vote_events AS h
    JOIN dbo.arb_votes AS v ON v.id = h.vote_id
    JOIN dbo.projects AS p ON p.id = v.project_id
    ORDER BY p.demand_id, v.voter_object_id, h.revision;

The application exposes no history edit/delete endpoint. Database administrators still have their normal database privileges.

## Scope of this increment

Votes are project-level, not yet grouped into separate ARB meeting rounds or bound to an ADR version. There is no close/reopen voting session workflow yet. Do not treat totals as final ARB approval: the designated EA must still approve the architecture and record completion through the completion workflow.

ARB applicability, ADR documents, EA approval and ARB completion remain on their existing implementation paths. The backend does not yet have a persisted applicability field to use as an additional voting gate. This increment enforces voting identity/role and persistence, not those lifecycle rules.

The Azure SQL migration and real Entra/browser integration must be verified in your environment. No live Azure database was used during local tests.

## Validation completed

- Full backend suite: 108 passed, 1 skipped; 3 subtests passed.
- Includes 25 ARB voting and migration checks: roles, invalid reasons, identity spoofing, stale revisions, independent voters/projects, audit preservation, rollback, and SQL Server DDL compilation.
- Frontend production build passed; existing bundle-size warning remains.
- ARB UI suite: 7 passed, including polling, role restrictions, submission and failure handling.
