# Security review follow-up

Apply this overlay to the project root after the dedicated Security agent workflow. Restart the backend and frontend together. It uses the existing Security review table and private artifact storage configuration.

## Review meeting

1. Browse for TXT, VTT, or Markdown files and choose **Save transcripts**.
2. Refresh the page and verify that the saved files still appear and can be downloaded.
3. Select the saved transcripts for this review and choose **Generate Security AI review**.
4. Review the seven-section template and cited transcript lines. Accept the advisory review for human assessment.

New transcripts use the private Blob path `<demand-id>/security/transcripts/`. New reviews store transcript references and cited excerpts. Previous reviews retain access to their previously saved transcript copies. To use an older transcript in a new review, download it from its saved review and upload it through **Save transcripts**.

## Human Security assessment

Open **Security assessment → Security assessment**. Choose **Edit human review**, revise the assessment text and decision fields, and save. The accepted AI source is a separate read-only reference. The saved human review displays a formatted summary. Submitted reviews retain their historical source and remain read-only until an authorized reviewer reopens them.

## Tests

From `backend`, run `uv run --locked python -m pytest -q tests/test_security_reviews.py tests/test_security_agent.py tests/test_security_preparation.py`. From `frontend`, run `npx vitest run src/SecurityReviews.test.tsx` and `npm run build`.
