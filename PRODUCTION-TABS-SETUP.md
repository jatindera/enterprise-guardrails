# Production tabs UI update

Copy the three files under frontend/src into the matching folder in your project, replacing the existing files:

- ProjectWorkspace.tsx
- ProductionGate.tsx
- ProductionRecord.tsx

No backend files, migrations, dependencies, or environment settings need changing.

## Changes

- The stage summary card now reads Production.
- There is one top-level Production tab immediately after ARB review.
- Production contains Pre-Production Gate and Go-Live and LeanIX sub-tabs.
- The existing gate form is under Pre-Production Gate.
- The existing deployment and LeanIX form is under Go-Live and LeanIX.
- Both forms remain mounted so switching tabs retains unsaved fields and selected attachments within the open workspace. This does not add persistence across browser refreshes.
- Existing validation, decisions, and save behaviour are retained.
- Pre-Production Gate is the default sub-tab when a project workspace is first opened. Returning to Production in the same workspace retains the selected sub-tab.

## Check in VSCode

In the frontend folder run:

    npm run build
    npm run dev

Refresh the browser and open a project.

1. Confirm the summary card says Production.
2. Confirm only one Production tab appears next to ARB review; the old Production & LeanIX top-level tab should be absent.
3. Click Production and confirm the two sub-tabs have the requested labels.
4. Confirm Pre-Production Gate contains the existing joint-decision form and document upload area.
5. Enter an unsaved comment, switch to Go-Live and LeanIX, then switch back. Confirm the comment remains.
6. Confirm Go-Live and LeanIX contains the existing production status, go-live date when applicable, LeanIX fields, and save action.
7. Click the Production summary card while another workspace section is selected. It should open Production and highlight the card and main tab.

Validation completed: TypeScript and Vite production build passed. The existing bundle-size advisory remains. No backend change was made.
