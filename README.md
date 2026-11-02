# Standard EA meeting review — increment 3 only

This patch is based on the supplied newcode(1).zip. It standardizes the AI review
contract, task, deterministic report and frontend presentation. It does not remove
the final EA assessment technology panel, create the human final assessment, add
complexity classification or change architecture diagrams.

## Install

1. Back up your current source or commit it to git.
2. Copy the ZIP's backend/ and frontend/ directories over the matching directories
   in your project. Include new files, especially backend/app/modules/ea_meeting_reviews/template.py.
3. Restart the backend and frontend. Deploy both sets of changes together.
4. No database migration, package installation or environment change is required.
   Existing reviews and their accepted history are preserved. No automatic AI call
   or regeneration runs at page load.
5. Generate/regenerate a review to see template 2.0. For an accepted workspace,
   use the existing authorized Reopen action with a reason before regenerating.

The task is selected by FastAPI at runtime. Existing generic hosted agent code
receives the updated task in the request; a new hosted version is not required
solely for this template. The change applies to hosted, local Foundry and Ollama
execution. Ollama's request-scoped JSON schema automatically uses the new model.
Normal deployment of your application code is still needed outside localhost.

## Standard report

| Section | Source and behavior |
|---|---|
| 1. Project understanding | Intake-reported purpose/outcome and supported meeting scope, with source distinctions |
| 2. Requirements and constraints | Transcript-backed requirements and actual discussion questions/answers |
| 3. Independent technology review | Current proposal's suitability, alternatives and trade-offs; not automatic agreement |
| 4. Gaps and contradictions | Open/resolved items, changes and conflicts supported by transcripts |
| 5. Follow-up questions | Up to six prioritized questions; required when readiness needs clarification |
| 6. Review readiness | Needs clarification or Ready for human assessment, plus a reason |
| 7. Evidence references | Application-copied source excerpts with E1/E2 labels, transcript IDs, filenames and lines |

Ready for human assessment means sufficient information for architectural judgment.
It does not mean implementation tests passed, controls are verified, or the project
is approved. Pending deployment tests alone should not keep discovery open if the
architectural design inputs are sufficient. Material missing design inputs should.

Readiness is advisory: this increment does not introduce a new acceptance permission
or readiness gate. Existing assigned-EA/Admin acceptance rules and confirmation remain.

## Implementation

- MEETING_REVIEW task profile version: 2.0.0; generated template_version: 2.0.
- Pydantic ReferencedReview validates new model output; absent mandatory template,
  readiness or alternatives/trade_offs fields fail rather than create a misleading draft.
- Needs clarification requires at least one nonblank, bounded follow-up question.
  Technology clarification cannot coexist with Ready for human assessment.
- ReviewResult retains legacy fields for old results. Structured JSON is saved in
  existing ea_meeting_reviews.ai_result; formatted text in review_text. No new table.
- Headings, grouping and evidence labels are generated in Python, not by an extra
  model call. Repeated references to one transcript line share one excerpt.
- Backend accepts only existing, nonblank transcript source lines. Reference validity
  does not prove that the interpretation is correct; human inspection remains essential.
- New references use [E1] labels and section 7 excerpts. Older text keeps its old display.
- Frontend recognizes exact standard headings and explicit readiness labels. Attention
  is red; readiness sufficient for human assessment is blue, not approval green.
- Reviewer edits remain separate text versions; ai_result retains the original AI
  analysis, so a manually edited text version may differ from the original structured result.
- No additional model call, automatic retry, web search or token-budget increase.
  Prompt requests roughly 600 words or less, with at most 12 findings, 6 questions,
  and 3 alternatives/3 trade-offs. Model-generated length can still vary.

## Verification completed

- Backend: 474 passed, 1 skipped, 3 subtests passed.
- Frontend: 144 passed across 20 files.
- Production frontend build: passed; existing large-bundle warning remains.
- Tests use mocked inference/storage and test SQL. Live Azure/Ollama inference and
  your Azure SQL/storage configuration were not exercised here.

See TESTING.md for application validation steps.
