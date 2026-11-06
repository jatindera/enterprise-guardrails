# Positive path validation checklist — Internal Policy Helpdesk Web App

SYNTHETIC SCENARIO. Demand 6382. Intended to validate a 3-meeting path to **closed stakeholder requirements** and a **favorable but conditional EA technology assessment**, not a claim of real controls or cross-domain approvals.

## Setup

1. Import `01_Project_Intake_6382.md` as a new demand; do not overwrite Demand 5276 or Demand 3845.
2. Keep **Architect Assigned = testuser-ea@raspbians.com**. Do not replace this login. The same address is the EA facilitator identifier in all three transcripts; synthetic stakeholder emails use example.test and must never receive real messages.
3. Confirm intake renders: AI Effort Yes, 60 internal users, initial Office Only classification assumption, open content/security requirements, and technology undecided.
4. Open EA assessment → Review meeting; keep the same workspace for all three meetings. Search web OFF for a controlled test unless you intentionally want current-product research.
5. When testing the EA **Prepare** tab separately, its questions should emphasize stakeholder outcomes, scope, data, article approval, identity, grounding, integrations, support and cost. It must not treat any proposed stack as already selected.

## Stage 1 — Meeting 1 (discovery)

1. Attach only `02_Meeting_1_Discovery.txt`.
2. Select Proposal A stack/check boxes and paste rationale from `05_Technology_Proposals.md`; click Save proposal.
3. Generate review and leave draft unaccepted.

**Expected:** The AI identifies genuine AI-assisted retrieval need but correctly highlights unresolved knowledge ownership, classification, access filtering, data retention, evaluation, operating and cost requirements. It must not infer that Foundry has been chosen or approve the architecture. `Needs clarification` is plausible.

## Stage 2 — Meetings 1 + 2 (requirements mostly closed)

1. Keep Meeting 1 attached and add `03_Meeting_2_Design_Clarifications.txt`.
2. Switch to Proposal B, click Save proposal.
3. Verify that an older draft cannot be accepted after the inputs changed; regenerate a new draft.

**Expected:** The AI recognizes internal-only release, 70 approved articles, Confidential support form data versus Office Only content, role-aware access, no auto-actions, 90-day requests and 30-day redacted telemetry, 60-question evaluation, cost target, fallback, and support targets. It should distinguish planned controls from tested evidence and avoid re-asking settled business topics. Concrete service selection, cost feasibility and delivery evidence remain pending.

## Stage 3 — Meetings 1 + 2 + 3 (positive closure)

1. Keep the two existing files and attach `04_Meeting_3_Final_Closure.txt`.
2. Enter Proposal C; Save; Regenerate review.
3. Inspect findings and source citations and confirm the review considers **all three transcripts and the current proposal**.

**Expected:**

- Recognizes all **stakeholder business requirement questions** have been answered within three meetings.
- Reports a feasible and justified **Azure + Foundry** pilot candidate for a small app; it must not insist AI or Azure is mandatory for every project.
- Understands Foundry only generates grounded answers, Azure AI Search retrieves approved articles, and user-specific permissions apply throughout the retrieval path.
- Recognizes Entra internal access, 60 users, 10 concurrent pilot, two data classifications, no autonomous actions, no guest accounts, no SAP/HR integration and a manual support fallback.
- Acknowledges agreed figures (RTO 8 h, RPO 24 h, pilot budget **target** $350/month, p95 page target <3 s excluding AI, AI answer target <12 s, and 60-question test set).
- Clearly distinguishes **requirements closed** from **technical validation pending**. Deployment, IAM, privacy, content filters, quality tests, backup/restore and pricing remain to be verified.
- Does not invent Microsoft product guarantees, organizational policy, deployed services, signed approvals or achieved evaluation results.
- May produce a positive `Reviewed` result **with conditions** where supported by the application's status taxonomy; alternatively `Needs clarification` is acceptable if it is explicitly about implementation evidence rather than reopening settled stakeholder requirements. Do not judge only by status label.
- Does not change the architect, final EA decision, ARB status, Security/RAI approvals or production gate automatically.

## Persistence and authority checks

- Refresh after saving each proposal and verify stack/rationale restore.
- Confirm each review version stores a snapshot of its own proposal and transcript set.
- Editing proposal/transcripts invalidates an unaccepted older draft for acceptance.
- Generated suggestions are not automatically copied to the final EA assessment fields.
- Primary EA/Admin may reopen accepted review according to existing app rules and reason logging; never overwrite previous accepted evidence.
- AI citations must point to real relevant excerpts of the attached files, not invented source lines.
- Do not treat fictional statements such as "the team will validate" as proof that controls passed tests.

## Failure indicators

- Says this demand is the supplier certificate tracker or Agent 365 SDK.
- Claims the web app has been built, deployed, security-approved or RAI-approved.
- Asks again whether external users or autonomous actions are in scope after Meeting 3.
- Confuses Office Only approved articles with Confidential support records.
- Says $350/month is guaranteed or Foundry is free.
- Reopens settled scope instead of treating engineering and governance checks as conditions.
- Automatically selects technologies or marks the human's final EA decision.

## Result log

| Check | Pass / Fail / Review | Notes |
|---|---|---|
| Intake matches synthetic Demand 6382 | | |
| Assigned EA login unchanged | | |
| Stage 1 correctly identifies genuine gaps | | |
| Stage 2 closes and updates known topics | | |
| Stage 3 recognizes complete business scope | | |
| Stage 3 gives viable conditional Azure/Foundry assessment | | |
| Technical tests and Security/RAI approvals remain separate | | |
| Review versions use correct proposals and transcripts | | |
| Persistence and stale-draft protection | | |
| Evidence citations and no fabricated facts | | |
| Final human EA decision unchanged until human acts | | |

Review outputs for groundedness and completeness, not exact wording. Transcripts are short synthetic extracts and not meant to represent the full length of real 30–45 minute interviews.
