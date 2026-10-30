# Production deployment results — SQL persistence and approval enforcement

Copy the backend and frontend folders from this ZIP into your project, replacing matching files. This package builds on Pre-Production-Storage.zip. Preserve your environment settings and other existing files.

## Behaviour

- A Submit button appears immediately beside the Production status dropdown under Production > Go-Live and LeanIX.
- Assigned primary EA, Security, RAI, or Admin may submit. The signed-in person's verified Entra object ID and matching domain role are checked against the current SQL assignments. An additional reviewer or unrelated user is read-only.
- All three latest, current pre-production gate decisions must explicitly say Approved to submit In production. Conditional approval, On hold, Rejected, Not applicable, missing decisions, and decisions invalidated by primary reassignment block the action with a domain-specific reason.
- Admin has no bypass for this three-approval check. Admin can still record/edit the three gate decisions through the existing gate interface.
- Under this latest strict rule, marking the pre-production gate not required does not exempt the project from the three explicit approval requirement for recording In production. If that project has no three current approvals, Admin must make the gate applicable and record the approvals before go-live can be submitted.
- The In production dropdown option is disabled when blocked, and the reason appears above it. FastAPI independently checks again during Submit, including when someone bypasses the UI or changes an approval in another session.
- The production record is saved in Azure SQL: status, actual go-live date, deployment comments, submitted-by name, UTC timestamp, and revision.
- Each actual change appends a history event with the verified actor object ID and a snapshot of the supporting gate decision IDs/revisions.
- The current production status is also returned in project list/detail responses so the portfolio stage remains Production after refresh.
- Saving records deployment information; it does not execute an Azure deployment.
- An authorized person may submit Not deployed without gate approval, for example to correct or revert a record. This clears the current go-live date while retaining history.
- If an approval later changes after a deployment was already recorded, the past deployment record remains an historical fact. The UI displays the current blocker; it does not silently undo an actual deployment. A new In production submission must satisfy the current approvals.

## LeanIX scope

LeanIX fields remain on the same sub-tab. Their separate Save LeanIX details button retains the existing local-workspace behaviour. It cannot submit or modify production status. Recording a Submitted LeanIX reference requires the production status already saved in SQL to be In production, rather than merely selected in the dropdown. LeanIX persistence/API submission is not part of this increment.

## 1. Database migration

Stop the backend. From backend in PowerShell:

    uv run alembic upgrade head
    uv run alembic current
    uv run python -m pytest -q

Expected current revision:

    20261029_production_results

The new migration is:

    backend/migrations/versions/20261029_production_results.py

It adds production columns to projects and creates production_deployment_events. Existing projects initialize as Not deployed with revision 0, no date and no submitter. Old frontend-only deployment entries cannot be reconstructed by this migration; submit them through the new form if needed. Existing gate decisions and attachments are retained.

Restart the backend with your normal command. No new dependency, Azure resource, permission, storage setting, or environment variable is required.

## 2. Frontend

From frontend:

    npm run build
    npx vitest run tests/ProductionRecord.test.tsx tests/GateAttachments.test.tsx tests/ProductionGate.test.tsx src/api/projects.test.ts tests/ARBVoting.test.tsx tests/gateWorkflow.test.ts
    npm run dev

Refresh the browser after both sides are updated.

## 3. End-to-end verification

1. Open a project with one or more pre-production gate decisions missing. Open Production > Go-Live and LeanIX. Confirm In production is disabled and the reason identifies the missing domains.
2. Record Approved for EA and Security, but Conditional approval for RAI. Confirm the reason shows RAI: Conditional approval, and In production remains disabled.
3. Change RAI to Approved. Return to Go-Live and LeanIX, or wait for the active tab's 15-second refresh. In production should become selectable.
4. As an assigned primary EA, Security, RAI, or Admin, select In production, enter the actual go-live date and optional deployment comments, then press Submit beside the dropdown.
5. Confirm success, the saved status, and the Last submitted by name/time. Refresh the browser; the status, date, comments and history should remain. Return to the portfolio and confirm its stage is Production.
6. Repeat using assigned Security and RAI users. Additional reviewers, unrelated architects, ARB-only members and general users must see read-only fields and a disabled Submit button.
7. As Admin, confirm Submit works when all three approve. Change one gate decision to On hold, return to Go-Live and LeanIX, and confirm Admin is also blocked from an In production submission.
8. In two sessions, load the same deployment revision. Submit a change from one session, then submit from the other. The second must report a conflict and reload saved values instead of silently overwriting the first change. The UI preserves unsaved drafts on ordinary unchanged polling.
9. Record Not deployed as an authorized reviewer. Confirm the current go-live date clears, the portfolio leaves Production, and prior history remains.
10. Confirm the existing optional gate uploads/downloads and reviewer decisions still work. Saving LeanIX details must not change deployment status.

Date validation uses today's UTC date (also shown in the field label). A go-live date is required for In production and cannot be a future UTC date. Not deployed must have no go-live date. Comments are optional, up to 4000 database characters.

## API

    GET /api/projects/{demand_id}/production-deployment

Returns the saved fields, production revision, project revision, canSubmit, canMarkInProduction, blocker, and deployment history.

    PUT /api/projects/{demand_id}/production-deployment
    {
      "productionStatus": "In production",
      "goLiveDate": "2026-10-29",
      "comments": "Deployment verified",
      "expectedRevision": 0
    }

Use revision from the production GET, not the project revision. Each change increments production revision and the project's normal revision. Stale submissions return 409; unauthorized submitters return 403; missing gate approvals return 409 with the reason; invalid dates/comments return 422.

The write holds the same SQL Server project row lock used by gate edits while it verifies current approvals, records the event snapshot, and updates the project. Actor identity and approval flags cannot be supplied in the request body. An identical save against the current revision does not create another history event.

## SQL checks

    SELECT demand_id, name, production_status, go_live_date,
           production_comments, production_saved_by, production_saved_at,
           production_revision, revision
    FROM dbo.projects
    ORDER BY demand_id;

    SELECT p.demand_id, e.revision, e.production_status, e.go_live_date,
           e.comments, e.actor_name, e.actor_object_id, e.recorded_at,
           e.gate_approval_snapshot
    FROM dbo.production_deployment_events e
    JOIN dbo.projects p ON p.id = e.project_id
    ORDER BY p.demand_id, e.revision;

## Verification completed

218 backend tests passed, 1 skipped, plus 3 subtests passed. The production tests cover all assigned-primary roles, Admin, unassigned/additional reviewers, missing/non-approved/reassigned gate decisions, a gate change between viewing and submitting, stale revisions, persistence, reimport, rollback and migration initialization/SQL Server compilation.

57 targeted frontend tests passed. The production build passed with the existing bundle-size advisory.

These backend tests use a disposable test database and SQL Server SQL compilation. The migration and end-to-end browser flow still need verification against your Azure SQL resource. No live deployment or LeanIX submission was performed.
