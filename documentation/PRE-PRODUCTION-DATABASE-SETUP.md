# Pre-Production Gate — database and permissions increment

This package assumes you installed the ARB applicability migration and Production sub-tabs UI from the previous increments. Copy the backend and frontend folders into your project, replacing matching files. Keep your existing environment files and other project files.

## What works now

- Gate requirement is stored in Azure SQL on projects.gate_required.
- Import and reimport read Pre-Production Gate Required from the Markdown. Yes means required; No, None, blank, or missing means not required. Invalid/conflicting values return a validation error.
- Latest intake reimport replaces an Admin applicability override, just like ARB.
- The checkbox remains visible. Only Admin can change it, enforced by FastAPI.
- When checked (not applicable), reviewer forms, evidence area, and history are hidden. Existing decisions remain stored.
- Primary EA, Security, and RAI each record only their own decision, using verified Entra object IDs and their matching role. Additional reviewers cannot record primary decisions. Admin can edit all domains.
- Every edit appends an immutable-by-API history row with the domain, decision, comments, revision, primary reviewer binding, verified actor object ID/name, and UTC timestamp.
- Saved cards are read-only until the permitted person clicks Edit decision. Cancel edit restores the saved values. Concurrent/stale saves return 409 rather than overwriting another edit.
- All signed-in application users can read the records, consistent with the transparency requirement.
- The active gate tab refreshes shared decisions every 15 seconds. Opening it or refreshing the browser loads saved decisions from SQL. Unchanged polling does not overwrite an in-progress comment.
- Evidence is optional. Approval does not require an attachment.
- Attachment selection is still local in this increment and clears on refresh. Uploads to egstorageadlshn / project-artifacts follow in the next increment. No storage credentials/settings are needed yet.

## Combined status

- Not required when the checkbox is checked.
- Rejected if a current reviewer rejects; otherwise On hold if a current reviewer is on hold.
- Awaiting decisions while any current reviewer decision is missing or requires reconfirmation after reassignment.
- Conditional approval when all three have current decisions and at least one is conditional (unless rejected/on hold).
- Approved ONLY when all three current decisions are Approved.
- Not applicable when all three are recorded, none is conditional/rejected/on hold, and at least one is Not applicable.

Existing saved decisions are retained when applicability changes. Re-enabling the gate does not delete them. A primary reassignment makes that domain's old decision require reconfirmation, while retaining its history.

## Intake format

Add this row to a Markdown table:

| Field | Value |
|---|---|
| Pre-Production Gate Required | Yes |

Or use a bullet export:

- **Pre-Production Gate Required:** Yes

Use No or a blank value for a non-required gate. Reimport the project after changing its file.

## 1. Backend installation

Stop the backend. In the backend folder run:

    uv run alembic upgrade head
    uv run alembic current
    uv run python -m pytest -q

The current revision should be:

    20261028_gate_decisions

The new migration file is backend/migrations/versions/20261028_gate_decisions.py.
It adds projects.gate_required, initializes existing projects from their latest intake snapshot, and creates gate_decision_events. Existing projects without the intake field default to not required. It does not migrate unsaved frontend-only decisions or delete ARB data.

Start the backend with your normal command. No new packages, Azure resources, app roles, or environment settings are required for this increment.

## 2. Frontend installation

In the frontend folder:

    npm run build
    npx vitest run tests/ProductionGate.test.tsx tests/ARBVoting.test.tsx src/api/projects.test.ts tests/gateWorkflow.test.ts
    npm run dev

Refresh your browser after both sides are updated. The new API response includes gateRequired; update frontend and backend together.

## 3. End-to-end checks

1. As Admin, import a project with Pre-Production Gate Required = Yes. Open Production > Pre-Production Gate. The checkbox must be unchecked, and all three read-only reviewer names should appear.
2. Check the checkbox. The form should disappear while the checkbox remains visible. Refresh and confirm it stays checked. Uncheck it to restore the form.
3. As primary EA, confirm only EA can be edited and the checkbox is disabled. Choose Approved, enter a comment, and record the decision WITHOUT attaching evidence. It should save and become locked.
4. Refresh. Confirm the EA decision, comment, and timestamp remain. Click Edit decision, change it, save, and expand Decision history. Both revisions and the actor name should appear.
5. Repeat with assigned Security and RAI users. Confirm each can edit only their own domain. An additional reviewer or unrelated user must remain read-only.
6. As Admin, confirm all three domains can be edited. Record Approved for all three and confirm the combined label is Approved.
7. Change one to Conditional approval, On hold, Rejected, or Not applicable. Confirm the combined label changes and history retains earlier decisions.
8. Open the same project in another signed-in browser session. A saved decision should appear after the next refresh/poll. It should survive browser refresh.
9. In two sessions, edit the same domain from the same saved revision. Save one and then the other. The second save must report a conflict and reload the latest data.
10. Reimport with No or blank. The form should hide. Reimport with Yes and confirm it returns. Intake takes precedence over any Admin checkbox override.
11. As Admin, reassign a primary reviewer through the existing assignment process. Its old decision should require reconfirmation and the previous actor must no longer be allowed to save.

If login roles were recently changed, sign out and back in so the token contains the latest roles.

## SQL checks

    SELECT demand_id, name, gate_required, revision
    FROM dbo.projects
    ORDER BY demand_id;

    SELECT p.demand_id, e.domain, e.revision, e.decision, e.comments,
           e.reviewer_name, e.actor_name, e.actor_object_id, e.recorded_at
    FROM dbo.gate_decision_events e
    JOIN dbo.projects p ON p.id = e.project_id
    ORDER BY p.demand_id, e.domain, e.revision;

## API

    GET /api/projects/{demand_id}/pre-production-gate

Returns required, projectRevision, canChangeApplicability, combinedStatus, reviewers, and history. Reviewer entries include canEdit, revision, current, and saved.

    PATCH /api/projects/{demand_id}/pre-production-gate/applicability
    { "required": false, "expectedRevision": 3 }

Admin only. Use the projectRevision returned by GET.

    PUT /api/projects/{demand_id}/pre-production-gate/decisions/EA
    { "decision": "Approved", "comments": "Implementation checked", "expectedRevision": 0 }

Replace EA with Security or RAI. Use that domain's revision from GET, initially zero. Actor identity comes only from the verified token, never the submitted body.

## Scope and verification

Gate data, permissions, applicability, and combined status are now enforced by FastAPI. The existing EA/Security/RAI assessment decisions/classifications and actual go-live record still follow their existing frontend implementation; this increment does not introduce backend deployment execution or claim that the whole production lifecycle is persisted. Classification-change validation remains on the existing frontend path until assessment persistence is implemented.

The frontend deployment guard skips the gate prerequisite for an explicit server-loaded gate exemption; EA, Security, RAI, and applicable ARB prerequisites remain intact.

Verified here: 173 backend tests passed, 1 skipped, plus 3 subtests passed; 40 targeted frontend tests passed; production build passed with the existing bundle-size advisory. Backend tests use SQLite and existing SQL Server compilation checks. The new migration was exercised against a test database, not your live Azure SQL database. Complete the migration and browser checks above locally before the storage increment.
