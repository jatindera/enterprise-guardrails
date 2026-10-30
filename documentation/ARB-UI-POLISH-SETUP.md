# ARB interface polish

Apply after ARB-Voting-Rounds.zip.

## Changes

1. Core Team Vote is the first tab and opens by default. ADR & meeting documents is second.
2. Close voting uses a deep teal-blue style; Reopen voting uses a muted violet style. Disabled and keyboard-focus states are included.
3. Expanding Previous rounds automatically loads the archived records: names, votes, timestamps and reasons against. View round and Back to current round buttons are removed.
4. Archived summaries appear inline, newest first, while the current round remains visible above them. They remain read-only.
5. History is loaded only when expanded. A history-loading error has its own Retry history action and does not disable current-round voting.

## Install

Back up the four included frontend files, copy them into the matching project paths, then run from your frontend folder:

    npm run build
    npm run test:arb
    npm run dev

Refresh your browser after restarting the frontend.

There are no backend, database, migration, npm dependency or .env changes.

## Test

- Open ARB review and confirm Core Team Vote is first and selected.
- As Admin, check that Close voting is teal-blue when voting is open and Reopen voting is violet when closed.
- Expand Previous rounds. The original voters and reasons should appear automatically, without another button.
- Confirm the current round remains visible and its controls retain the same permissions.
- Collapse and expand history again. The archived votes must remain read-only.
- On a narrow screen, the named summaries should stack vertically.

Validation: frontend production build passed; 16 ARB UI tests passed.
