# ARB voting — names and reasons summary

Apply this increment after ARB-Database-Voting.zip.

## What is included

- A two-column voting summary: green for In favour and red for Against.
- Each entry displays the recorded name and vote timestamp. Votes against show their reason underneath.
- Columns stack on narrow screens; names and long reasons wrap instead of being cut off.
- Names are captured from the verified Entra sign-in claims and stored with both the current vote and each new history entry.
- The voter remains identified by their Entra object ID. A client cannot submit another person's name.
- Counts and the names list come from the same database query.
- Refresh and the existing 15-second polling reload the summary from the database.
- Existing voting permissions remain unchanged. All signed-in application users may read the summary.

## 1. Copy files

Back up your project, extract the ZIP, and copy the included backend and frontend files into the matching project locations. Keep both .env files unchanged.

No additional Azure resources or application permissions are required.

## 2. Apply the migration

From your backend folder:

    uv run alembic upgrade head
    uv run python -m pytest -q

The new migration is:
backend/migrations/versions/20261028_arb_voter_names.py

It follows 20261028_arb_votes and adds nullable voter_name columns to arb_votes and arb_vote_events. It does not delete or replace any votes.

Restart the backend after migrating.

## 3. Frontend

From your frontend folder:

    npm run build
    npm run test:arb
    npm run dev

No new npm dependencies are added by this increment.

## 4. Existing votes

Votes recorded before this update did not contain a name. Their summary displays Name not recorded and the associated Entra object ID so they remain distinguishable.

To populate the current name, the original voter signs in and saves their vote again:

- In favour: click Vote in Favour again.
- Against: click Vote Against, keep or update the reason, then confirm.

This saves the verified name and retains exactly one counted vote for that member. No second counted vote is added. Older history rows keep a NULL name because the application cannot reconstruct what the person's display name was when those historical events occurred.

New votes automatically store the name. If the user's verified display name later changes, their next saved vote captures the updated name while older history keeps its original snapshot.

The Entra display name is used when present; the verified sign-in username is the fallback. A previously stored name is not erased if a later token omits its name.

## 5. Test in your application

1. As a core-team member, save a vote and check that your name appears in the appropriate summary panel.
2. Vote against and enter a multiline reason. Check the reason is visible below your name.
3. Refresh the browser and reopen the project. Name, vote, timestamp and reason must remain.
4. Use another core member in a separate browser profile. Their vote should appear within 15 seconds while the voting tab is open.
5. Sign in as a read-only application user and confirm the named summary is visible but voting is disabled.
6. Change a vote. The member should move between panels and still be counted once.
7. For a legacy vote, follow the re-save instructions above and confirm the placeholder is replaced by the sign-in name.

## 6. Verify Azure SQL

Current votes:

    SELECT p.demand_id, v.voter_name, v.voter_object_id,
           v.choice, v.reason, v.revision, v.recorded_at
    FROM dbo.arb_votes AS v
    JOIN dbo.projects AS p ON p.id = v.project_id
    ORDER BY p.demand_id, v.voter_name;

History snapshots:

    SELECT p.demand_id, h.voter_name, v.voter_object_id,
           h.choice, h.reason, h.revision, h.recorded_at
    FROM dbo.arb_vote_events AS h
    JOIN dbo.arb_votes AS v ON v.id = h.vote_id
    JOIN dbo.projects AS p ON p.id = v.project_id
    ORDER BY p.demand_id, v.voter_object_id, h.revision;

## Scope and testing

This increment does not add voting rounds, meeting closure, ADR document storage, or automatic ARB completion.

Local tests use SQLite, offline SQL Server migration compilation, and mocked sign-in/API calls for UI tests. Live Azure SQL and Entra sign-in must be verified in your environment.

Full backend suite: 115 passed, 1 skipped; 3 subtests passed.
Frontend ARB tests: 9 passed.
Frontend production build: passed (existing bundle-size warning remains).
