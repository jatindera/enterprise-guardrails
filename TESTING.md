# Application testing steps

Use the fictional Supplier Certificate project, Demand 5276, from the earlier
validation pack. Do not upload proposal/checklist Markdown files as transcripts.
For minimal cost, do steps 1–3 with two generations. Other checks are optional.
Keep the workspace Open between stages; acceptance is tested last.

## 1. First meeting: missing information

1. Open EA Assessment → Review meeting for Demand 5276.
2. Use the existing workspace, or start one if needed. If previously accepted,
   reopen with a reason using the primary EA or Admin account.
3. For a clean staged test, include Meeting 1 only. Do not remove evidence from a
   real project for testing; use a dedicated test demand/workspace.
4. Select Proposal A from 05_Technology_Proposals.md, or your own proposal. Enter
   the rationale and click Save proposal.
5. Upload/save 02_Meeting_1_Discovery.txt and click Review meeting with AI.
6. Confirm the seven numbered sections appear in the fixed order from README.
7. Check for material gaps such as retention conflict, supplier access, identity,
   licensing/support and recovery expectations. Expect Needs clarification, a reason
   and focused questions. The review should challenge an unsupported expensive stack.
8. Check [E#] labels against section 7 and the actual transcript. Quotes should match
   the original line (or explicitly show excerpt truncation). Both sides of a
   reported contradiction should be cited. Recommendations are not company policies.

Do not require exact wording, exhaustive findings or a particular vendor choice.
The maximum findings/questions limits mean prioritization is necessary.

## 2. Second meeting: revised context and proposal

1. Keep Meeting 1 attached and add/save 03_Meeting_2_Clarifications.txt in the same
   workspace. There is no Next meeting step.
2. Change the proposal to Proposal B, or a justified revised proposal, and Save.
3. Click Regenerate review.
4. Confirm the same seven-section template appears and the CURRENT proposal is
   assessed, with suitability, alternatives and trade-offs.
5. Check that the five-year draft is distinguished from the later seven-year agreed
   design requirement. Upload order alone must not determine chronology.
6. Confirm proposed access/recovery controls are not described as implemented or
   tested. Licensing and written records evidence may still be open.
7. Readiness may remain Needs clarification if a material design dependency remains;
   the reason/questions must explain why. It may become Ready for human assessment
   when supported by the evidence. Do not force readiness just because a second
   transcript was added or the human prefers a platform.
8. Open an earlier review version: its content must remain unchanged.
9. Refresh/restart the app: saved proposal, transcripts and new template must restore.

## 3. Acceptance and authority

1. Inspect/edit any needed reviewer corrections using Edit review text; save as a
   new version. Confirm red/green labels are categories, not compliance decisions.
2. Click Accept meeting review → Cancel: workspace stays Open.
3. Click Accept meeting review → Confirm acceptance: accepted workspace becomes
   read-only. This confirms the meeting summary, not the final EA project verdict.
4. Refresh: accepted text/history remains. Primary EA/Admin can reopen with a reason.
5. Reopen, change proposal or transcripts: the old draft must not be accepted against
   changed inputs; regenerate through the existing stale-input checks.
6. View-only users cannot edit/accept. Additional EA can edit an Open workspace but
   cannot accept/reopen unless existing permissions allow it.
7. Confirm the separate final EA assessment screen, stack, complexity and verdict
   have not been changed by this increment.

## Optional scope-change test

Add Meeting 3 and change to Proposal C, then regenerate. External supplier access
introduces new material questions. Expect reassessment/clarification, not an
assumption that more transcripts always imply greater readiness.

## Automated checks on your machine

Backend (from backend/):

```powershell
uv run python -m pytest -q
```

Frontend (from frontend/):

```powershell
npx vitest run
npm run build
```

## Troubleshooting

- Old layout: check both backend and frontend files were copied; restart both. Existing
  reviews deliberately keep their previous template until you regenerate.
- invalid_schema: read the displayed field names and backend ea_review_failed event.
  New output needs template_version, readiness and the technology list fields. A
  malformed response is Failed, never silently replaced by a demo or accepted draft.
- Output limit: the model did not complete its JSON. No partial draft is accepted.
  Check the selected execution mode/model and output budget deliberately; this patch
  does not raise limits or trigger paid retries automatically.
- Missing source: verify all needed transcripts are Ready in this workspace; previous
  AI reviews/prepared questions are still excluded from model context.
