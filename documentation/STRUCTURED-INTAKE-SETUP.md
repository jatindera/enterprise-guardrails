# Structured project intake — database migration and backfill

This package builds on the previous production/gate increments. Copy the backend folder into your existing project, replacing matching files and adding new ones. Preserve your .env and other project files. No frontend files or Azure resources need changing.

## What changes

Imported intake facts now have typed SQL columns, separate from decisions made in Enterprise Guardrails:

- projects: existing project identity, primary reviewer bindings, workflow and deployment records.
- project_intake_snapshots: one immutable source version per import, with source system, source item ID/URL, source modification time, ETag, import time and original filename.
- project_intake_details: 51 typed intake fields per version, including the full problem statement, value description, desired outcome, business function, program, timelines, budget, priority, AI classification, solution/vendor, integration, data, user, delivery and source review information.
- project_intake_stakeholders: requestor, sponsor, business partner, program manager, project manager, demand-review participants and source reviewer names/emails.
- project_intake_fields: source field/paragraph values with their section, label and order. This retains unmapped fields, section statuses, and separate Security/Architecture/Priority comments rather than overwriting them.

See INTAKE-FIELD-MAPPING.md for the exact SQL column and source-label mapping.

The typed columns and stakeholder rows are used by the new context API. GET does not reparse Markdown to produce those values. Each reimport creates a new set of structured rows linked to its intake version. Missing fields in the latest source do not silently inherit an earlier version's value.

Money and scores use exact decimal columns; expected users use an integer; Yes/No flags use nullable booleans. Timeline quarters and original source date strings remain text. Unrecognized/conflicting values remain available in sourceFields with a parsing warning instead of being guessed or discarded. Original reviewer decisions stored by this application are not overwritten by imported assessment status text.

## Transitional Markdown retention

This increment deliberately retains the original Markdown column and the existing intakeSource response for audit, backfill comparison and compatibility with existing UI/assignment consumers. Markdown is still accepted by the existing import screen; the same import also writes structured rows atomically.

It is not yet safe to drop the Markdown column: verify the backfill first and switch remaining legacy consumers before the removal migration. We will remove that transitional storage in a separate step after verification. This package does not silently delete your existing audit sources.

The structured storage function also accepts already-structured data without a Markdown document, and this is tested using source_system=sharepoint. A live SharePoint connector, source-column mapping, access permissions, and synchronization logic are NOT implemented here. Source metadata columns and the common storage function prepare that later integration; they do not establish a connection to SharePoint.

## 1. Apply the schema migration

Stop the backend and take your normal database backup/export before applying a schema update.

From backend in PowerShell:

    uv run alembic upgrade head
    uv run alembic current

Expected current revision:

    20261030_structured_intake

New migration:

    backend/migrations/versions/20261030_structured_intake.py

It adds three structured tables and source metadata columns. It does not delete project, approval, production, voting, attachment, or original intake data.

## 2. Backfill existing intake versions

Still in backend, run:

    uv run python -m app.scripts.backfill_intake

Example output:

    {"completed": 12, "failed": []}

Each existing version is processed in its own transaction. A second run safely skips completed versions. It does not change the project revision, current assignments, approvals, or original Markdown.

If failed is nonempty, those versions remain retryable and the command exits with a failure code. The reported snapshot IDs/error types identify which rows need investigation. Do not remove the Markdown source while any version remains unprocessed. A null typed field with parsingWarnings is different from a failed backfill: its original value is retained for review.

Then run:

    uv run python -m pytest -q

Restart the backend using your normal command. No package installation, environment-variable change or frontend rebuild is required for this backend-only increment.

## 3. Test through your existing frontend

1. Import/reimport your sample .md file using the current Admin import screen.
2. Open the project and confirm the current overview, reviewer identities, original intake view, gate, and production screens still work.
3. In browser DevTools > Network, inspect the GET /api/projects/3845 response when opening the project. It now contains intakeContext beside the existing intakeSource. Expand intakeContext.facts and stakeholders.
4. Confirm problemStatement, valueDescription, desiredBusinessOutcome, businessFunction, targetProjectStart, dataClassification, regulatoryData and expectedUserCount match your file.
5. Confirm the Sponsor, Requestor and IT business/program/project manager entries contain the expected names/emails. A source person with only a name has email=null; no email or identity is invented.
6. Change the desired outcome in your test intake, reimport, and confirm the latest structured outcome changes while the previous intake version remains available.
7. Verify missing fields in a newer file are null in that intake version rather than copied from the previous source.

The new context is read-only through the API. Existing import rights remain Admin-only; all signed-in application users may read the structured context, consistent with project transparency.

## 4. API for agents and future integrations

    GET /api/projects/{demand_id}/intake-context

Returns:

- version: snapshotId, sourceSystem, sourceItemId, sourceUrl, sourceModifiedAt, sourceEtag, sourceFileName, importedAt, structured.
- facts: typed business/solution/intake-review fields.
- stakeholders: role, displayName, email and sourceValue.
- comments: section-scoped source comments.
- sourceFields: all parsed source entries, including unmapped fields and notes, with section/label/order.
- parsingWarnings: conversions or conflicting values requiring inspection.

History:

    GET /api/projects/{demand_id}/intake-versions
    GET /api/projects/{demand_id}/intake-context?snapshotId=<version-uuid>

A version must belong to the requested project. An old version that has not been backfilled returns 409 with backfill instructions, rather than presenting incomplete structured data as ready. The standard project GET returns intakeContext=null for such a legacy version until backfill completes.

## 5. SQL verification

Current structured business context for your sample:

    SELECT TOP (1) p.demand_id, d.title, d.business_function,
           d.problem_statement, d.value_description, d.desired_business_outcome,
           d.target_project_start, d.target_project_go_live,
           d.budget_amount_usd, d.priority_score, d.ai_effort,
           d.expected_user_count, d.data_classification, d.regulatory_data
    FROM dbo.projects p
    JOIN dbo.project_intake_snapshots s ON s.project_id = p.id
    JOIN dbo.project_intake_details d ON d.snapshot_id = s.id
    WHERE p.demand_id = '3845'
    ORDER BY s.imported_at DESC, s.id DESC;

Stakeholders across versions:

    SELECT p.demand_id, s.imported_at, st.role, st.display_name, st.email, st.source_value
    FROM dbo.projects p
    JOIN dbo.project_intake_snapshots s ON s.project_id = p.id
    JOIN dbo.project_intake_stakeholders st ON st.snapshot_id = s.id
    WHERE p.demand_id = '3845'
    ORDER BY s.imported_at DESC, st.ordinal;

Separate comments:

    SELECT p.demand_id, s.imported_at, f.section, f.field_name, f.value
    FROM dbo.projects p
    JOIN dbo.project_intake_snapshots s ON s.project_id = p.id
    JOIN dbo.project_intake_fields f ON f.snapshot_id = s.id
    WHERE p.demand_id = '3845' AND LOWER(f.field_name) = 'comments'
    ORDER BY s.imported_at DESC, f.ordinal;

Confirm backfill completeness (expected 0):

    SELECT COUNT(*) AS versions_needing_backfill
    FROM dbo.project_intake_snapshots s
    LEFT JOIN dbo.project_intake_details d ON d.snapshot_id = s.id
    WHERE d.snapshot_id IS NULL;

Inspect conversion warnings before relying on fields for agent reasoning:

    SELECT snapshot_id, parser_version, parsing_warnings
    FROM dbo.project_intake_details
    WHERE parsing_warnings <> N'[]';

## Scope and validation

239 backend tests passed, 1 skipped, plus 3 subtests passed. Tests cover your full sample, typed values and stakeholders, section-scoped comments, unknown fields, conflicts, version history, source-independent reads, atomic rollback, idempotent/retryable backfill, API read/import permissions, migration execution/SQL Server compilation, and a future structured SharePoint adapter writing without Markdown.

Tests use a disposable database and stubbed directory lookups; no live Azure SQL migration or SharePoint connection was performed here. Existing frontend files are unchanged. Run the migration/backfill and the sample checks locally before considering the transition verified.
