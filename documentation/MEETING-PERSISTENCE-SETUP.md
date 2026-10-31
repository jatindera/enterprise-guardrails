# Saved meeting preparation and question progress

## Apply

Copy the included `backend` and `frontend` files into the matching existing project folders. This package builds on the EA agent integration, chat welcome/animation and question-regeneration updates already supplied.

Stop FastAPI, keep your existing `.env`, and run from `backend`:

```powershell
az login
uv run alembic upgrade head
uv run python -m pytest -q
```

The new migration is `20261030_meeting_preparation.py`, following `20261030_remove_raw_intake`. It creates `meeting_preparations` and `meeting_prepared_questions`. No existing intake or review data is migrated or deleted. Previously unsaved browser drafts cannot be recovered after refreshing; save/copy any draft you want to retain before updating.

Restart FastAPI. From `frontend`, run:

```powershell
npm run build
npx vitest run
```

Then restart Vite. No agent redeployment, Foundry version change, storage account change or new Azure resource is required.

## Behavior

- EA, Security and RAI use the same implementation, with separate records per project and review domain.
- All preparation questions are saved, including manual and AI drafts, selection, ordering, source and priority. Additional meeting questions, current question and asked-question order/timestamps are saved too.
- Changes appear immediately, then save after one second without changes. Ten quick selections normally produce one PUT request and one database transaction, not ten requests. A transaction can contain several SQL statements.
- If the user selects two questions quickly, pauses ten seconds, selects one, pauses two seconds and selects two quickly, the normal result is three batched saves.
- Only one save request is in flight for a loaded meeting. Changes made while it is in flight are kept in the latest draft and saved after it completes. Clicking Start meeting or the Conduct meeting tab flushes pending changes and waits for success.
- Returning to Prepare or other mounted project sections does not discard saved questions. Refresh loads the saved record; selected questions automatically populate Conduct meeting. Use question records the current/asked question. Refresh and reopen Conduct meeting to resume. The UI defaults to Prepare after refresh.
- Asked question text/order cannot be changed or removed; Prepare locks those questions to preserve discussion history. Their asked status survives refresh. This increment provides one working meeting record per project/domain; separate meeting occurrences/archives are a later feature.
- Assigned reviewers, eligible additional reviewers and Admin may edit their respective domain. Other signed-in users can read it. Permission checks run in FastAPI against verified identity bindings on every save.
- Saving status is shown above the review content. A temporary failure retains the local draft and offers Retry save. Revision conflicts or revoked permissions stop further writes and require Reload saved questions; that button explicitly discards local changes. Conflicting drafts are not silently merged or overwritten.
- A browser close/refresh warning is requested while changes remain unsaved. Internal component navigation makes a best-effort flush; wait for Saved before closing the app. Start meeting always awaits a successful flush. An abrupt browser/process shutdown cannot guarantee delivery of pending changes.
- Chat history, transcripts and accepted meeting-review text still have their existing local-draft behavior. This increment persists question preparation/progress, not every workspace artifact.
- EA question regeneration continues preserving manual, selected and asked questions. Security/RAI AI-agent integration and web search are separate later increments.

## Test through the UI

1. Sign in as assigned EA or Admin and open a project > EA assessment > Prepare. Wait for loading to finish.
2. Generate questions and quickly select ten (or use several manual questions). Expect Unsaved changes, Saving and Saved. In DevTools > Network, filter `meeting-preparation` and count PUT requests, excluding GET/OPTIONS.
3. Try the two / pause ten seconds / one / pause two seconds / two sequence. Expect three saves when each earlier request has completed.
4. Change a selection and immediately click Start meeting before the one-second timer expires. Conduct meeting must open only after save succeeds, displaying selected questions.
5. Click Use question for two questions in a different order from the preparation list. Wait for Saved, refresh, and reopen Conduct meeting. Verify current question, Asked buttons and discussion-history order.
6. Add an additional question during the meeting; verify it survives refresh too.
7. Open the same domain/project in two browser tabs. Load both, save in the first, then edit in the second. The second must show a conflict instead of overwriting the first. Use Reload saved questions to continue.
8. Stop FastAPI or use the browser offline control, then edit. The local draft must remain visible with a save failure. Start meeting must not move forward. Restore connectivity and click Retry save.
9. Sign in as an unrelated reviewer or general user: existing questions should be visible and editing unavailable. Direct PUT attempts must return 403. Repeat for Security and RAI to verify domain isolation.

The backend uses Azure SQL; automated transaction/migration tests use SQLite as a disposable test double. Live Azure SQL migration and browser-to-API checks should be verified in your environment.

## Verification results

326 backend tests passed, one skipped, three subtests passed. All 111 frontend tests and the production frontend build passed. Checks include timing/batching, overlapping saves, retries, conflicts, role/domain isolation, restoration, migration DDL and optimistic concurrency.
