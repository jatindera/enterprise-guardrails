# ARB voting closure and new rounds

Apply after ARB-Voter-Summary.zip. The code is based on the uploaded project plus our previous increments.

## Behavior

- The initial voting round is available automatically. There is no Open voting button.
- Only Admin can close voting. The chief architect uses the Admin role as agreed.
- Admin does not gain voting rights unless also assigned arb-core-team.
- At least one submitted vote is required to close.
- Closing locks the round for everyone, including Admin and core-team members.
- At closure, more than 50% of submitted votes in favour means Passed. A tie or majority against means Returned for review. Absent members are excluded; no quorum is imposed.
- Only Admin can reopen, with a mandatory reason. Reopening creates the next round with zero votes; everyone must vote again.
- Prior rounds, votes, names, reasons, outcomes, closure timestamps and responsible administrators remain stored.
- Current-round totals never include ballots from earlier rounds.
- Historical rounds are accessible under Previous rounds and are read-only.

## Install

1. Back up your source and database.
2. Stop the backend and frontend before replacing files.
3. Extract the ZIP and copy backend and frontend files into the corresponding project folders. Keep .env files unchanged.
4. From the backend folder:

       uv run alembic heads
       uv run alembic upgrade head
       uv run python -m pytest -q

   The new revision is 20261028_arb_voting_rounds. Its predecessor is 20261028_arb_voter_names.
5. From the frontend folder:

       npm run build
       npm run test:arb

6. Restart both applications with your usual commands. Refresh existing browser tabs so they use the matching new API contract.

No new Azure resources, credentials, npm dependencies or .env settings are needed.

## Existing votes

The migration preserves every vote and history entry. It places existing votes in round 1, initially Open. Admin can close that round when ready.

The schema change replaces uniqueness per project/member with uniqueness per project/round/member. It adds an ARB voting rounds table and links each ballot to its round.

Existing names not recorded before the name-summary increment remain unknown. A closed round cannot be edited just to update its name snapshots.

## User interface

Open current round:
- Round number and Open badge.
- Existing vote buttons, named summaries and totals.
- Close voting appears for Admin; it is disabled with zero votes.

Closed current round:
- Closed badge and stored Passed or Returned for review outcome.
- Closing administrator and timestamp.
- Votes and reasons are read-only.
- Reopen voting appears only for Admin. It reveals a mandatory reason field and confirmation.

After reopening:
- The new round shows no votes.
- Previous rounds is a collapsible history list. View round N displays the original names, votes and reasons.
- Back to current round returns to the active ballot.

## Portfolio and EA approval

The durable backend record in this increment is the voting round and its outcome.

The existing frontend portfolio shows ARB Completed only when the current round is closed with Passed AND the project's current EA decision is Approved. Reopening changes the frontend ARB status back to In progress and clears its completion date. Viewing old history does not restore an old completion.

EA approval and overall project assessment persistence are still on their existing frontend implementation path. This increment does not make those separate decisions durable or claim backend verification of EA approval. Backend-enforced overall ARB completion can be connected when EA decisions are persisted.

## Test in your environment

1. Open an applicable project as a core member. Save a vote and refresh the browser.
2. Sign in as Admin. Confirm Close voting is available after at least one vote.
3. Close voting. Check the outcome, timestamp and read-only controls.
4. Refresh the page and verify the Closed status remains.
5. In a browser profile with a core member, try changing a vote after another Admin closes it. The backend must reject it even if the browser had not yet refreshed.
6. As Admin, choose Reopen voting. A blank reason cannot be submitted.
7. Enter a reason and confirm. The new round must show zero votes and no saved personal vote.
8. Vote in the new round. The member counts once in that round, with no contribution from the old round.
9. Expand Previous rounds and view the closed round. Original names and reasons must remain unchanged. Return to the current round.
10. Test a tie using two core accounts. Closure must produce Returned for review.
11. As a core member without Admin, verify Close and Reopen controls are absent; direct API requests are denied with 403.
12. If EA approval is present in the current frontend state, verify a closed Passed round shows ARB Completed. Reopening must remove that completion.

## API

- GET /api/projects/{id}/arb-voting returns the current round.
- GET /api/projects/{id}/arb-voting?roundNumber=1 returns an older round.
- PUT /api/projects/{id}/arb-vote now requires roundNumber as well as choice, reason and expectedRevision.
- POST /api/projects/{id}/arb-voting/close accepts:

      { "roundNumber": 1 }

- POST /api/projects/{id}/arb-voting/reopen accepts:

      { "roundNumber": 1, "reason": "Updated architecture requires another review." }

The authenticated identity is never taken from request bodies. Stale round numbers and attempts to change closed votes return 409. Stale duplicate reopen requests cannot create extra rounds.

All mutations acquire the same SQL Server project-row update lock until transaction commit. This orders close and vote operations: a committed vote before closure is included; one arriving after closure is rejected. A failed close or reopen transaction rolls back without leaving a partial state.

## Azure SQL checks

Round status and administrator audit:

    SELECT p.demand_id, r.number, r.status, r.outcome,
           r.closed_in_favour, r.closed_against,
           r.closed_by_name, r.closed_at,
           r.opened_by_name, r.opened_at, r.reopen_reason
    FROM dbo.arb_voting_rounds AS r
    JOIN dbo.projects AS p ON p.id = r.project_id
    ORDER BY p.demand_id, r.number;

All ballots, explicitly showing their round:

    SELECT p.demand_id, v.round_number, v.voter_name,
           v.choice, v.reason, v.revision, v.recorded_at
    FROM dbo.arb_votes AS v
    JOIN dbo.projects AS p ON p.id = v.project_id
    ORDER BY p.demand_id, v.round_number, v.voter_name;

Ballots in the latest round only:

    SELECT p.demand_id, v.round_number, v.voter_name, v.choice, v.reason
    FROM dbo.arb_votes AS v
    JOIN dbo.projects AS p ON p.id = v.project_id
    WHERE v.round_number = (
        SELECT MAX(r.number)
        FROM dbo.arb_voting_rounds AS r
        WHERE r.project_id = v.project_id
    )
    ORDER BY p.demand_id, v.voter_name;

An empty reopened round correctly produces no ballot rows in the last query.

## Validation

- Backend: 136 passed, 1 skipped; 3 subtests passed.
- ARB UI: 14 passed.
- Frontend production build passed; the existing bundle-size warning remains.
- Includes role enforcement, closure outcomes, zero votes, stale rounds, immutable history, reopening reasons, rollback failures, and SQL Server lock-hint/migration compilation.
- Tests use SQLite for backend integration and mocks for UI sign-in/API calls. Real Azure SQL migration, Entra roles and simultaneous browser interactions must be verified in your environment.
- ADR document storage and persisted applicability remain outside this voting increment.
- Downgrade refuses to combine multiple rounds; it will stop if a later round exists rather than discard history.
