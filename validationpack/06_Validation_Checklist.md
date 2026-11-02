# Independent EA review validation — Demand 5276

## Purpose

Validate that the EA agent uses the latest saved human proposal and all attached meeting transcripts, challenges unsupported choices, asks useful follow-up questions and preserves human decision authority.

All scenario content is fictional. This is a manual validation pack, not an assertion that a particular model has passed these tests. It does not establish company policy, vendor capabilities or approvals.

## Which file goes where?

| File | Use |
|---|---|
| 01_Project_Intake_5276.md | Import as the new project intake |
| 02_Meeting_1_Discovery.txt | Upload as the first transcript in Review meeting |
| 03_Meeting_2_Clarifications.txt | Add as a second transcript in the SAME review workspace |
| 04_Meeting_3_Optional_Scope_Change.txt | Optional third transcript for the scope-change branch |
| 05_Technology_Proposals.md | Copy checkbox selections and rationale into the UI; do not upload as transcript |
| 06_Validation_Checklist.md | Human tester reference only; do not upload to the AI |

Do not upload proposals/checklist documents as transcripts: that would leak the expected results into the test context.

## Setup

1. Use Demand 5276 only if unused in your test database. If it already belongs to another project, choose another unused numeric ID and update the intake and transcript headers consistently before import.
2. Import file 01 through the application's intake import flow. Do not import it over the Agent 365 project.
3. The sample's existing EA login `testuser-ea@raspbians.com` is retained only for application access. If your active assigned EA differs, replace that one field with your real test EA login before import, or assign it through Administration. Dummy transcript speakers are not Entra accounts and must not be created merely to run this test.
4. Other stakeholder email addresses use the reserved example.test domain. No messages should be sent to them. Security assignment is intentionally not provided.
5. Confirm Demand 5276, the new project name, Procurement business function and the three narrative fields appear correctly. The AI Effort flag is No: using an EA reviewer agent does not make the business application an AI solution.
6. Confirm the proposal-persistence migration is applied. Ollama or an explicitly selected Azure mode may be used. Keep Search web off for a controlled test.
7. Open EA Assessment -> Review meeting and use one workspace throughout. Leave the final EA assessment verdict unchanged while testing.

The minimum AI test is two reviews: Meeting 1 with Proposal A, then Meetings 1 and 2 with Proposal B. The A/B isolation check and Meeting 3 branch are optional to keep inference costs low.

## Stage 1 — incomplete requirements and an oversized proposal

1. Attach only file 02.
2. Enter Proposal A from file 05 and click Save proposal.
3. Refresh and confirm the stack and rationale restore.
4. Generate a review. Leave the workspace Open; do not accept this intermediate draft unless you also intend to test reopening.

### Expected behavior

- Recognizes the workload is a document register and reminder workflow; no AI or large analytical-processing requirement has been established.
- Challenges the justification for Foundry/Databricks without inventing an AI feature or claiming such technologies can never be used.
- Identifies meaningful gaps: supplier access, offline requirement, retention conflict, access roles, data inventory, integration boundary, support/recovery, licensing or measurable pilot criteria.
- Identifies the five-year versus seven-year retention contradiction as unresolved.
- Asks focused questions. Exact wording/order and exhaustive coverage are not required; the current output has at most six follow-up questions and twelve findings.
- Treats the human proposal as a preference, not company policy or an approval.
- Technology status should ordinarily be Needs clarification. Assess the explanation and questions, not only the label.

### Clear failures

- Calls the application an Agent 365 integration.
- Assumes all supplier users need access, or that offline operation is already mandatory.
- Invents company policy or declares the proposed platform free because subscriptions exist.
- Automatically approves the technology stack or changes the human's final EA decision.

## Stage 2 — new transcript and revised proposal

1. Keep file 02 attached; add file 03 to the same workspace.
2. Replace Proposal A with Proposal B and save.
3. Before regenerating, try accepting the older Stage 1 draft. The backend should reject it because the saved inputs changed. Do not accept the outdated version for this test.
4. Regenerate a new review.

### Expected behavior

- Uses both transcripts and the CURRENT Proposal B.
- Recognizes first-release scope is internal-only and online; external login, offline editing and runtime supplier-master integration are out of scope.
- Recognizes seven years is now the agreed fictional design requirement and the five-year draft has been superseded. It may still ask for the written records requirement; it should not continue presenting five versus seven years as an unresolved stakeholder disagreement.
- Recognizes a monthly manual CSV reference update, no write-back, daily reminders at 30/14/7 days, role requirements, pilot scope and agreed test targets.
- Distinguishes planned access/recovery tests from completed evidence.
- Evaluates the low-code candidate against those requirements. It should surface licensing, query design, permissions, change history, retention/hold and recovery validation where relevant rather than asserting the products automatically satisfy them.
- Does not keep evaluating Proposal A as if it were the selected current proposal. It may explain why the revised option is more proportionate.
- Does not demand generative AI or Databricks without a requirement.

Reviewed or Needs clarification can both be reasonable at this stage: written evidence, licensing and technical feasibility are still unverified. A well-grounded explanation matters more than forcing a particular status. Do not force the agent to recommend Power Apps or any single vendor.

## Context isolation test — same evidence, different proposal

For a clearer A/B comparison, attach Meetings 1 and 2, run Proposal A, then change only the proposal to B and regenerate. Verify the feedback changes appropriately and the older draft cannot be accepted against the new proposal.

When inspecting a request in Foundry, expect exactly task, project_context, human_proposal and transcripts. Prior AI reviews and prepared questions should not be injected. A local Ollama run should not create a Foundry request.

## Optional Stage 3 — a changed scope can reopen questions

1. If the latest draft has already been accepted, reopen it as the assigned primary EA or Admin with reason: `Assess requested external supplier self-service scope`.
2. Keep Meetings 1 and 2 and add file 04.
3. First regenerate with Proposal B unchanged. Then optionally enter Proposal C and regenerate again.

### Expected behavior

- Distinguishes a newly requested external-access expansion from the last agreed internal-only release.
- Does not silently rewrite the original scope or claim 300 external users were always in scope.
- Asks about sponsor/release-scope decision, identity lifecycle ownership, supplier isolation, file upload controls, support and cost.
- Does not assume the old design or the new Azure preference automatically satisfies external access.
- Continues to retain the agreed retention requirement; the new request did not alter it.
- Does not grant approval. Needs clarification is the appropriate direction while scope and key design inputs remain unsettled.

This optional branch tests that additional context can introduce new uncertainty rather than always making AI more confident.

## Persistence and authority checks

- Saved proposal survives page refresh and backend/frontend restart.
- Ticking multiple checkboxes alone does not issue proposal-save requests. Save proposal batches the changes; Review/Regenerate saves pending changes first.
- Save errors prevent AI generation and leave local edits available.
- Each review version's input snapshot retains the proposal used at that time.
- Human proposal edits do not change existing review snapshots or the final EA assessment's technology selection/complexity/verdict.
- Acceptance locks the current workspace. Primary EA/Admin can reopen with a reason; earlier accepted versions remain unchanged.
- A valid copied source excerpt proves where the text came from, not that the finding's interpretation is correct. Read the cited original line when checking important findings. Long-line excerpts may be marked as shortened.

## Suggested result log

| Check | Pass / Fail / Needs inspection | Notes |
|---|---|---|
| Correct new project context | | |
| Stage 1 challenges unsupported stack justification | | |
| Stage 1 identifies missing information and retention conflict | | |
| Stage 2 uses both transcripts and the revised proposal | | |
| Superseded requirement is distinguished from missing written evidence | | |
| Proposed controls are not described as tested controls | | |
| Saved proposal restores after restart | | |
| Old draft is blocked after input changes | | |
| Optional Stage 3 recognizes scope change and asks questions | | |
| Source references support material findings | | |
| Final human EA verdict remains unchanged | | |

Do not grade word-for-word output. Record unsupported facts, omitted material risks, incorrect conflict handling, source relevance and human-authority violations.
