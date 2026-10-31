# Persistent EA meeting reviews — apply and test

This increment connects EA Review meeting to the existing EA agent in local or hosted mode, stores original transcripts in private Blob Storage, and records meeting/review history in Azure SQL. Security and RAI review integration remain unchanged.

## Install

1. Copy the included backend/ and frontend/ files into your current project, preserving their paths. They build on the latest Conduct Meeting, Chat Scope and Multiple Transcripts UI increments. Use your actual frontend project directory containing package.json; this ZIP uses frontend/.
2. Stop/restart services normally after applying the migration. From backend:

```powershell
uv run alembic current
uv run alembic upgrade head
uv run alembic current
uv run python -m pytest -q
```

The new head should be `20261031_ea_meeting_reviews`; its parent is `20261030_meeting_preparation`. The migration creates three new tables without backfilling or changing existing project decisions/questions. Existing local transcript selections and demo reviews were never stored, so reattach those files once in the new flow.

3. Restart FastAPI and frontend. For a deployed frontend, run `npm run build` and deploy normally.
4. Use your existing Foundry configuration, execution mode and private storage settings. This increment does not require a new agent-container deployment, agent version, dependency upgrade, Azure resource or secret. The review task profile is sent by FastAPI at runtime; core agent instructions are unchanged.

Storage uses the existing APP_STORAGE_ACCOUNT / APP_STORAGE_CONTAINER and Azure CLI or managed-identity authentication. For your setup the account/container remain `egstorageadlshn` / `project-artifacts`. The backend identity needs Blob data read/write access, as it does for gate evidence. Original blobs are written under:

`{demand_id}/ea/meetings/{meeting_id}/transcripts/{upload_id}/{extension}`

No public Blob URL or SAS is exposed. Downloads go through the authenticated backend and verify file size/digest. Accepted meetings and their source files cannot be changed through the app. Removing an unaccepted file hides it from new reviews but retains its original Blob/metadata for historical references; no physical retention-deletion policy is added.

## Test 1: first meeting

Use a test project and sign in as assigned primary EA or Admin.

1. Open EA Assessment > Review meeting. Click **Create first meeting**.
2. Drag `review-test-data/meeting-1.txt` into Add meeting transcripts. It is fictional test data. You may add other .txt, .vtt or .md transcripts from the same meeting.
3. Click **Save transcripts** and wait for confirmation. Selected files are only local drafts until this button succeeds. The saved transcript list should show Ready, with Preview and Download.
4. Refresh the browser and reopen Review meeting. Meeting 1 and the saved transcript must still be listed. Download it and confirm its contents match the original.
5. Click **Review meeting with AI**. A draft should appear with a concise consolidated summary, source-referenced findings and follow-up questions. Check that the unconfirmed support owner/RTO remain open, and the technology choice is not treated as selected.
6. Edit the text, e.g. append `Reviewer note: validate support ownership with Operations.` Click **Save review changes**. This creates a new immutable version rather than overwriting the AI output. Refresh; your edit must remain. Earlier versions should still be selectable.
7. Click **Accept review draft**. Confirm the meeting becomes Accepted and read-only, with the accepting reviewer and timestamp displayed. **Start next meeting** should now be available. The accepted summary also reloads into the EA assessment's supporting-review area after browser refresh.
8. Confirm the EA assessment approval/status has not changed. Accepting the summary does not approve the project or verify controls.

AI output wording varies. Verify facts and citations, not exact prose. Each finding must cite an actual supplied source UUID, line and exact quote. Incorrect source IDs, line numbers or quotes cause the generation to fail without accepting a review.

## Test 2: second meeting and continuity

1. Click **Start next meeting**. The UI should create Meeting 2; Meeting 1 remains in the selector.
2. Attach and save `review-test-data/meeting-2.txt` only. Do not re-upload Meeting 1's transcript.
3. Click **Review meeting with AI**. The backend sends Meeting 2 transcripts, compact current intake, selected questions and the **latest accepted consolidated review** from Meeting 1. It does not resend all historical transcripts or perform a web search.
4. Verify the output identifies Operations support ownership as new/resolved information and the retention change from 30 to 90 days as a changed proposal requiring confirmation, rather than silently replacing the old statement as verified fact. The recovery target remains a proposal subject to confirmation. The technology option is still undecided. Questions absent from the prepared list may be extracted from the transcript.
5. Check the previous-review context notice shown under the draft. Save any corrections, then accept Meeting 2.
6. Select Meeting 1. Its transcript and all previous review versions must remain unchanged and read-only. Refresh and check Meeting 2 is still accepted and the latest accepted review is restored.
7. Start Meeting 3 to repeat the process. Only the latest accepted consolidated review is used as carry-forward context.

Before acceptance, verify important unresolved items were carried forward. This is project-scoped review continuity, not model training. Automatic retrieval of arbitrary older transcript passages is not part of this increment; originals remain available through their meeting's Preview/Download and authenticated transcript endpoints.

## Permissions

| User | View history/download | Upload, generate, save draft versions | Accept review |
|---|---|---|---|
| Assigned primary EA with EA role | Yes | Yes | Yes |
| Additional EA with EA role | Yes | Yes | No |
| Admin | Yes | Yes | Yes |
| Other signed-in users | Yes | No | No |

The backend enforces these rules independently of disabled UI controls. Accepted records are immutable for everyone, including Admin; continue with a new meeting. Formal assessment closure rules are unchanged.

## Test 3: failure and concurrency checks

- **Storage access issue:** An upload failure must display an error, retain a Pending record and never report a saved file. Retry Save transcripts with the same selected file/ID. After refresh, a pending entry can be cancelled and the file reselected. No review can be generated or accepted while uploads remain Pending.
- **AI/configuration failure:** Temporarily use an invalid model configuration (local) or agent version (hosted), then generate. The request should fail visibly and leave a Failed history entry. No demo result or accepted review should be substituted. Restore configuration, refresh and generate a new version.
- **Stale evidence:** Generate a draft, add/save a different transcript, then try to accept the older draft. The backend must reject it. Regenerate against the new evidence.
- **Unsaved corrections:** Edit a draft. Accept must stay disabled until you save or discard edits. Switching meetings/review versions is disabled while edits remain unsaved; browser closing warns about unsaved edits/files.
- **Concurrent reviewers:** Open the same meeting in two browsers. Make a change in one, then generate/edit/accept with stale data in the other. Expect a conflict requiring refresh, rather than overwriting the newer state.
- **Lost response/refresh:** Refresh while a review is generating. The saved Generating request should be visible and polled for completion. A network timeout does not imply the operation failed: refresh before generating again. Completed request IDs are idempotent and do not trigger a second model call.
- **Interrupted backend:** If the process crashes after reserving a review, it can remain Generating. After ten minutes, an authorized editor may use **Recover interrupted review request**, then generate again. Recovery does not modify completed reviews.
- **Viewer/additional EA:** Verify the permission matrix, including additional EA being unable to accept. Check direct API access as well as controls.

## Cost and input limits

Generation is explicit: no model calls occur on page load, file upload, editing, acceptance or refresh. Each generation uses one normal EA agent request with no web tool, automatic research loop or additional summarizer. Regeneration is another paid request.

Active transcript files may be up to 2 MB each, 10 files and 10 MB combined per meeting, but storage limits do not imply all that content can be sent to the model at once. The default review request budget is **60,000 serialized characters**, including numbered transcript lines, previous review and instructions. No text is silently sampled or truncated. Oversized input fails before model invocation and is recorded as a failed attempt.

Optionally set `APP_EA_REVIEW_MAX_INPUT_CHARS` in backend/.env and restart FastAPI to raise the budget deliberately (hard maximum 200,000 characters). Consider model context capacity, cost and latency first. This increment does not implement chunked long-transcript processing. The existing agent output-token budget still applies; incomplete/invalid JSON output is rejected, not accepted.

## Database verification (Azure SQL)

```sql
DECLARE @DemandId nvarchar(64) = N'3845';
SELECT m.id, m.number, m.title, m.state, m.revision, m.created_at
FROM ea_review_meetings m
JOIN projects p ON p.id = m.project_id
WHERE p.demand_id = @DemandId
ORDER BY m.number;

SELECT m.number AS meeting_number, r.version, r.status, r.id,
       r.basis_review_id, r.parent_review_id, r.profile_version,
       r.execution_mode, r.agent_reference, r.created_at,
       r.accepted_at, r.accepted_by, r.accepted_by_name
FROM ea_meeting_reviews r
JOIN ea_review_meetings m ON m.id = r.meeting_id
JOIN projects p ON p.id = m.project_id
WHERE p.demand_id = @DemandId
ORDER BY m.number, r.version;

SELECT m.number, t.file_name, t.status, t.size_bytes, t.sha256,
       t.storage_account, t.container, t.blob_name, t.uploaded_at
FROM ea_meeting_transcripts t
JOIN ea_review_meetings m ON m.id = t.meeting_id
JOIN projects p ON p.id = m.project_id
WHERE p.demand_id = @DemandId
ORDER BY m.number, t.uploaded_at;
```

`ea_meeting_reviews.ai_result` preserves validated structured AI findings; `review_text` preserves the saved reviewer-facing version. Reviewer edits create new rows linked by parent_review_id. basis_review_id links a generated review to the prior accepted review. input_manifest stores only context/source metadata and selected-question snapshots, not original transcript text. Transcript originals are in Blob Storage.

## Validation performed here

Backend: 402 tests passed, 1 skipped, 3 subtests passed. Frontend: 126 tests passed across 18 files. Production frontend build passed with the existing bundle-size warning. Automated tests use a disposable SQLite database and mocked Azure storage/inference, not your live Azure resources. Migration upgrade/downgrade was tested locally and the new migration was compiled to Azure SQL DDL. Run `alembic upgrade head` against your configured database and complete the live two-meeting checks above before relying on the workflow.
