# ARB applicability — installation and verification

Copy the backend and frontend folders from this package into your existing Enterprise-Guardrails project, replacing matching files. Keep your existing environment files and other project files. This increment assumes the previous ARB voting rounds and UI changes are installed.

## Behaviour

| Latest intake value | Checkbox | ARB screens |
| --- | --- | --- |
| Yes | Unchecked | Visible |
| No | Checked | Hidden |
| Blank, None, or missing field | Checked | Hidden |

The checkbox always remains visible. Only Admin can change it, including changing a previously not-applicable project to required. The change is saved immediately to Azure SQL; no separate Save button is needed. The checkbox is disabled while loading or saving, and a failed save does not pretend to succeed.

Every reimport applies its latest intake value, replacing any Admin override. An absent field also means not applicable, rather than preserving an earlier Yes. A conflicting or unsupported field value is rejected with a validation error so it cannot silently change applicability.

The new migration initializes existing projects using their latest saved intake snapshot. Projects without a snapshot default to not applicable. Existing votes, rounds, voter names, reasons, and history are retained. Switching applicability does not erase votes or automatically reopen a closed round.

Voting, closing, and reopening are rejected by FastAPI when ARB is not applicable, even if a caller bypasses the UI. Historical voting results remain readable. Document uploads remain frontend-only, as in the previous increment.

## 1. Run the database migration

Stop the backend. Open PowerShell in your backend folder:

    uv run alembic upgrade head
    uv run alembic current
    uv run python -m pytest -q

The new migration file is:

    backend/migrations/versions/20261028_arb_applicability.py

The current revision should be:

    20261028_arb_applicability

Start the backend using your usual command. No environment settings or Azure resources need changing.

## 2. Check the frontend

In the frontend folder:

    npm run build
    npm run test:arb
    npx vitest run src/api/projects.test.ts
    npm run dev

If the frontend is already running, restart it and refresh the browser after the backend migration is complete.

## 3. Test in the application

1. Import a project with the following table row:

       | Architecture Review Board (ARB) required | Yes |

   Open ARB review. The checkbox should be unchecked and both ARB tabs should appear.

2. Reimport that project with No. The checkbox should become checked and both tabs should disappear. The checkbox itself should remain visible.

3. Repeat with a blank value, then None, then remove the ARB field entirely. Each should mean not applicable.

4. Reimport with Yes. Both ARB tabs should return.

5. As Admin, check the checkbox, refresh, and confirm the saved value remains checked. Uncheck it and confirm both tabs return. Reimport with No and confirm intake takes precedence over your override.

6. Sign in as a non-Admin EA or ARB core-team member. The checkbox must be disabled, even for the assigned EA. Normal document/voting permissions still apply when ARB is required.

7. On a project with existing votes, make ARB not applicable, then required again. Confirm its votes and previous rounds remain available. A closed round must remain closed until Admin explicitly reopens it with a reason.

8. For API verification, a non-Admin PATCH to the new endpoint must return 403. A core-team vote, Admin close, or Admin reopen on a not-applicable project must return 409. The automated tests cover these cases without needing manual token handling.

## API and database

Admin-only endpoint:

    PATCH /api/projects/{demand_id}/arb-applicability
    { "arbRequired": false, "expectedRevision": 3 }

Use the revision returned by the latest project response. Stale revisions return 409. The project list and detail responses now include arbRequired.

Azure SQL verification:

    SELECT demand_id, name, arb_required, revision
    FROM dbo.projects
    ORDER BY demand_id;

arb_required = 1 means required; 0 means not applicable.

## Validation completed

Backend suite: 154 passed, 1 skipped, plus 3 subtests passed. New tests cover import/reimport, access control, disabled voting actions, history retention, and migration backfill. Tests use SQLite with SQL Server model compilation checks in the existing suite; no live Azure SQL connection was used here.

Frontend: 31 tests passed across the ARB UI and project API suites. Production build passed with the existing bundle-size advisory. Azure SQL migration and browser verification must be completed in your environment.
