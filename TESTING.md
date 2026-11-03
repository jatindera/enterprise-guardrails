# Live validation

Use a test demand. Back up the database before applying the migration. Confirm `uv run alembic current` reports `20261103_ea_diagram_approval` after upgrading.

1. **Labels** — Expand AI source & human version details. Confirm the inner source is explicitly labelled Original AI review used for this assessment (read-only). Saved human review history still shows human versions.
2. **No diagram** — On a draft set Approved and complete the other required fields. Leave Diagram requirement as Required without a file. Save draft succeeds; Submit remains disabled. A direct submission request is rejected by the backend with HTTP 422.
3. **Persistence** — Upload a PDF/image/Draw.io/Visio diagram with a description. Refresh and restart the backend. The uploaded file remains listed and downloadable. Previously local diagrams need re-uploading.
4. **Human confirmation** — Click Use for human assessment. Save with the checkbox unchecked: approval remains blocked. Tick the explicit confirmation, Save draft, then submit. Approval succeeds.
5. **Version binding** — Submit using one diagram, then upload another version later. The old submitted review must retain its original file ID and filename. Inspect its saved history and snapshots.
6. **Reopen** — Reopen an approved review with a reason. The old submitted snapshot remains unchanged. The new draft retains the file link but has confirmation cleared; another approval requires renewed confirmation and saving.
7. **Not applicable** — Choose Not applicable with an empty justification: approval is blocked. Enter a legitimate reason and save; approval can be submitted. The reason remains in the saved review and snapshots.
8. **Conditional pending** — Choose Pending. Approved must stay blocked. Conditional approval requires diagram justification, action owner, due date and Conditions. Save and confirm submission; all details remain after refresh.
9. **Nonapproval/drafts** — On hold and Rejected may be submitted without a diagram, provided other decision fields are complete. Draft saving always allows missing diagram evidence.
10. **Permissions** — Additional/unassigned EA, Security and RAI cannot upload or select evidence for the final review or change its confirmation. Direct upload and review-write requests return 403. Primary EA/Admin can act.
11. **Wrong reference/storage failure** — A missing, Pending or other-project diagram ID cannot satisfy approval. Failed uploads must not appear in the Ready list or unlock submission. Restore storage access and retry the same unchanged upload.
12. **Regression** — Check human draft persistence, final confirmation, reopening, stale-edit 409 handling, AI-source preservation and the blue Open review meeting button. Removed EA pending items remain absent.

Commands:

```powershell
# backend
uv run python -m pytest tests -q
# frontend
npx vitest run --maxWorkers=2
npm run build
```

Record Pass / Fail / Needs inspection and share visible errors/HTTP status if anything fails. Do not share tokens or connection strings.
