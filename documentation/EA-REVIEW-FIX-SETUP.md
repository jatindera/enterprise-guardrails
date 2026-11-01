# Review feedback, file actions and failure diagnostics

Apply this increment over EA-Persistent-Meeting-Reviews.zip. Copy every included backend/frontend file and restart FastAPI and Vite (or rebuild the deployed frontend). Hard-refresh the browser to load the updated styles. No migration or hosted-agent redeployment is required for this patch.

## Visible feedback

Saving transcripts is now a bold blue notification at the bottom-right of the screen; successful saves appear bold green. Errors appear red in the same visible location. Notifications can be dismissed when the operation finishes. Other operations have specific messages, such as Loading transcript preview, Downloading transcript and Removing transcript.

## File controls

An ancestor disabled fieldset previously could block read controls when reviewer editing access or question loading was unavailable. Review meeting now separates read access from edit access. Signed-in viewers can inspect saved history and read files; mutation controls remain disabled unless server-provided permissions allow editing.

Preview opens the transcript in a dialog rather than below the file list. Downloads use an anchor attached to the document and retain the Blob URL long enough for the browser to start the download. Successful empty HTTP 204 responses are accepted without attempting JSON parsing. Removal reloads the saved list and shows confirmation. Unsaved reviewer edits must be saved/discarded before removing or uploading files, so refresh cannot silently discard them.

Accepted meetings remain read-only by design: Remove is disabled there. Removing a file from an open meeting does not physically delete its Blob; original files remain retained for historical source references.

## AI review validation

The old error grouped inference, JSON and citation failures into one message, so it does not establish the cause of your live failure. This patch reports a specific code and review reference, with a matching safe backend log event `ea_review_failed`. Logs contain stage, exception type, output character count and schema field paths/types, not transcript text, raw output, credentials or provider response bodies.

Exact source validation remains enforced. When a quote appears uniquely in the specified source, an incorrect line number or whitespace/line-wrap difference can be corrected deterministically. The stored citation uses the actual source excerpt and line. Unknown source IDs, invented words/numbers and ambiguous matches are still rejected. No second model call or automatic repair loop is introduced.

Common codes:

| Code | Meaning / next step |
|---|---|
| output_limit | Model stopped at its output cap. Check its configured output budget. |
| invalid_json | Invalid or incomplete JSON. Inspect the model completion status/output in Foundry; truncation is one possible cause. |
| invalid_schema | JSON does not match the review contract. Share the logged validation_fields types/paths. |
| unknown_source | Model cited an ID not supplied for this review. |
| quote_not_found | Quoted words cannot be found in the indicated source. |
| ambiguous_quote | A misaligned quote occurs more than once and cannot be relocated safely. |
| unknown_question | A model-supplied prepared-question ID does not exist in the request. |
| inference_error / provider_error | Check local/hosted execution configuration, model/agent deployment and access. |
| storage_read | The stored transcript could not be read from Azure. |

Local execution now checks finish_reason/continuation before treating text as complete. Hosted execution also distinguishes incomplete/empty responses. In local mode, FOUNDRY_MAX_OUTPUT_TOKENS controls the existing factory budget. Changing backend .env does not change an already deployed hosted container's output budget; a hosted budget change requires changing its configuration/code and deploying a new agent version. This patch does not raise token limits or costs automatically.

## Test

1. In an Open meeting, select a small transcript and click Save transcripts. Verify the blue bold Saving message is visible and changes to green Transcripts saved to storage.
2. Click Preview on a Ready file. Confirm a dialog opens with the original text and closes using Close preview or Escape.
3. Click Download and verify the original filename/content in your browser downloads.
4. Click Remove in an Open meeting. Verify the row disappears and a green notification appears. Accepted meetings must continue to block removal.
5. Sign in as a viewer: Preview and Download should work; Remove, upload and acceptance should stay disabled.
6. Generate a new review. Valid unique quotes with a wrong line number or changed whitespace can now be realigned. Invalid evidence still fails safely.
7. If generation still fails, copy the full new error code/reference and the matching `ea_review_failed` backend log line. Do not share .env, access tokens, raw transcripts or full model prompts. That information will identify the next fix without guessing.

If the old generic error still appears, the running backend is still using the earlier service.py or has not restarted.

Validation: 410 backend tests passed, 1 skipped, 3 subtests passed; 132 frontend tests passed; production frontend build passed (existing bundle-size warning remains). Cloud calls are mocked in these checks. The root cause of the live Azure inference failure cannot be confirmed from the earlier generic message alone.
