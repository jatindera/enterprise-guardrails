# Gate outcome rules — Conditional approval and Not applicable

Copy the backend and frontend folders from this ZIP into the matching locations in your existing project. This update builds on Production-Deployment-Results.zip and includes the subsequent UI change disabling Submit for Not deployed.

## Updated rules

| Current reviewer decisions | Overall pre-production outcome | May submit In production? |
| --- | --- | --- |
| All Approved or Not applicable | Approved | Yes |
| Any Conditional approval, with the other reviews complete and no On hold/Rejected | Conditional approval | Yes |
| Any On hold, with no Rejected | On hold | No |
| Any Rejected | Rejected | No |
| Missing or outdated/reassigned reviewer decisions | Awaiting decisions, unless a recorded blocking decision takes precedence | No |

Not applicable is equivalent to Approved for an individual review decision. The original Not applicable value remains in its dropdown, stored decision record, history, and deployment approval snapshot. Only the combined result is normalized to Approved.

All three reviewer decisions must still be recorded and current. Conditional approval does not bypass a missing or reassigned review.

This update concerns the reviewer decision value Not applicable. The separate Admin checkbox controlling whether the entire gate is required is unchanged; it is not substituted for three recorded reviewer decisions.

Permissions are unchanged: only assigned primary EA, Security, RAI, or Admin may submit production results. Admin has no bypass for On hold, Rejected, missing, or outdated decisions.

Submit remains disabled for the default Not deployed selection. When In production is selected, it is enabled only for an authorized user whose current gate decisions permit go-live. Date validation remains in place.

## Installation

Files changed:

- backend/app/modules/gate/service.py
- backend/app/modules/production/service.py
- backend/tests/test_gate.py
- backend/tests/test_production.py
- frontend/src/ProductionGate.tsx
- frontend/src/ProductionRecord.tsx
- frontend/tests/ProductionRecord.test.tsx

There are no migrations, new dependencies, Azure settings, or database changes. No existing decisions need to be rewritten or resubmitted just to apply this rule change.

Restart the backend after replacing its files. From backend:

    uv run python -m pytest -q

From frontend:

    npm run build
    npx vitest run tests/ProductionRecord.test.tsx tests/ProductionGate.test.tsx tests/GateAttachments.test.tsx src/api/projects.test.ts tests/ARBVoting.test.tsx tests/gateWorkflow.test.ts
    npm run dev

Refresh the browser after restarting/updating both sides.

## Manual checks

1. Record Approved for EA, Approved for Security, and Not applicable for RAI. Confirm the overall pre-production status reads Approved.
2. In Go-Live and LeanIX, confirm Not deployed keeps Submit disabled. Choose In production, enter a valid date, and confirm an authorized user can Submit.
3. Change one reviewer to Conditional approval. Confirm the completed overall status reads Conditional approval, and go-live is still permitted.
4. Set all three reviewer decisions to Not applicable. Confirm the overall status is Approved and go-live is permitted.
5. Change either EA, Security, or RAI to On hold. Confirm go-live is blocked with the domain and reason shown. Repeat with Rejected.
6. Confirm an unassigned/additional/general user remains read-only even when all decisions are permitting.
7. For a project with a missing reviewer decision, confirm go-live remains blocked until that review is completed.
8. Refresh and confirm stored decisions and deployment results remain available.

Approvals changed in another session are checked again by FastAPI during Submit, rather than trusting the UI's cached state. Existing deployment events remain historical records; later decision edits do not erase them.

Verified here: 224 backend tests passed, 1 skipped, plus 3 subtests passed. 58 targeted frontend tests passed. The production build passed with the existing bundle-size advisory. No live Azure SQL write was performed here; complete the browser checks in your environment.
