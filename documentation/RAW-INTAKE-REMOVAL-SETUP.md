# Remove whole-document Markdown storage

Based on your uploaded backend.zip. This is a backend-only increment. Keep the Structured-Intake-UI update already applied.

## Result

- The `project_intake_snapshots.markdown` column is removed.
- Project imports parse submitted Markdown in memory and save structured facts, individual source fields/comments, stakeholders, and source/version metadata. They do not save the complete original document.
- Project detail responses no longer include `intakeSource`; use `intakeContext`.
- Manual EA and Security identity retry reads the structured assignment field, with the existing directory verification, Admin-only restriction, and revision checks. RAI resolution already uses its configured/project assignment and needs no change.
- Snapshot metadata table remains: it links each historical import to its structured data and will identify SharePoint items/versions later. A `.md` filename or sourceSystem='markdown' is metadata, not stored document content.
- No SharePoint connector is introduced in this increment.

## Apply safely

This migration deliberately deletes the original full document text. Ensure a recoverable database backup/restore point exists before upgrading. Exact original Markdown cannot be recovered from structured data, so downgrade is intentionally blocked; rollback requires the pre-upgrade database and application release.

1. Stop the backend server and any other process importing projects. Keep it stopped until the migration finishes.
2. Copy the ZIP's `backend` folder contents over the corresponding files in your project's `backend` folder. This ZIP contains changed/new files only, not a replacement for the whole backend directory. Do not delete other files. Do not modify older migrations.
3. From `C:\Jatinder\Enterprise-Guardrails\backend`, run:

```powershell
uv run alembic current
uv run python -m app.scripts.backfill_intake
```

The database should currently be at `20261030_structured_intake` from the previous increment. If it is older, first run `uv run alembic upgrade 20261030_structured_intake`, then run the backfill command above. A new empty database can simply run `uv run alembic upgrade head`.

Backfill must report `"failed": []`. Previously completed backfill normally reports `"completed": 0`. The updated helper works with the legacy database even though the new ORM no longer maps Markdown.

4. Apply removal and tests:

```powershell
uv run alembic upgrade head
uv run alembic current
uv run python -m pytest -q
```

Expected head: `20261030_remove_raw_intake`.

The migration checks ALL historical intake versions. If any lacks structured data, it stops without dropping Markdown. Fix/backfill those versions before retrying; do not delete history to bypass the check. The migration requires a live database connection; offline SQL generation for this step is deliberately unsupported.

5. Restart the backend using your normal command, then restart/refresh the frontend.

No new Python packages, Azure resources, .env values, or frontend source edits are needed.

## Verify in Azure SQL

```sql
-- Expected: zero rows (the full-document column is gone).
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'project_intake_snapshots'
  AND COLUMN_NAME = 'markdown';

-- Expected: 0 missing structured versions.
SELECT COUNT(*) AS missing_structured_versions
FROM dbo.project_intake_snapshots AS snapshots
LEFT JOIN dbo.project_intake_details AS details
  ON details.snapshot_id = snapshots.id
WHERE details.snapshot_id IS NULL;

-- Source metadata remains available, without the original document text.
SELECT TOP (10) id, project_id, source_system, source_file_name, source_item_id, imported_at
FROM dbo.project_intake_snapshots
ORDER BY imported_at DESC;
```

## End-to-end checks

1. Open an existing project. Overview and Prepare > Project context should still show the imported description, business outcome, stakeholders, and fields.
2. Refresh the page: values should return from the database.
3. Import a NEW project from Markdown. Confirm its structured context appears and normal assignment resolution still runs.
4. Reimport with a changed description/outcome. Confirm the latest version changes and earlier structured versions remain available via `/api/projects/{demand_id}/intake-versions` and `/intake-context?snapshotId=...`.
5. GET `/api/projects/{demand_id}` should contain `intakeContext` and should not contain `intakeSource` or the complete Markdown text.
6. If an unresolved EA/Security assignment is available, sign in as Admin and retry resolution. It should use the assigned reviewer's structured field. Names or unrelated narrative emails never grant access.
7. After removal, running backfill again is harmless when all versions are complete. If structured data is missing after raw removal, it reports `StructuredIntakeMissing`; restore that version from its source rather than inventing data.

Existing historical migrations still mention Markdown because they describe the original schema. Keep them intact: a fresh database applies the entire migration chain and ends without the column. The transition backfill helper references the legacy column only when it exists; normal application reads/writes never use it.
