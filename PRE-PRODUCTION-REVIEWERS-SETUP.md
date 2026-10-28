# Pre-Production Gate — reviewer UI

Copy the frontend folder from this ZIP into your project, replacing matching files. This package builds on the Production sub-tabs update.

Changed/new files:

- frontend/src/ProductionGate.tsx
- frontend/src/ProductionGate.css
- frontend/src/gateIntake.ts
- frontend/src/ProjectWorkspace.tsx
- frontend/src/types.ts
- frontend/tests/ProductionGate.test.tsx

No backend files, migrations, Azure resources, or environment settings change in this increment.

## Add this to the intake Markdown

Append this section to your .md file, outside any code fence:

## Pre-Production Gate

| Field | Value |
|---|---|
| Pre-Production Gate Required | Yes |

Yes enables the form. No, None, blank, or an absent field disables it. Existing projects without this new field will have a disabled form until reimported with Yes. A narrative mention of Yes elsewhere does not enable the gate. Conflicting repeated values also cannot enable it.

A bullet export is supported too:

- **Pre-Production Gate Required:** Yes

Use either the table row or bullet field, not both. Reimport the project after editing the Markdown so the new intake contents are available to the UI.

## Reviewer behaviour

- EA, Security, and RAI names are read-only labels from the project's current assignments.
- Each assigned primary reviewer can record their own decision and comments, based on the existing verified access response.
- Additional reviewers cannot record the primary reviewer's gate decision.
- Admin can record any of the three reviews, consistent with the existing Admin edit rule.
- Other people see read-only decisions and comments.
- Comments are required. Approval and conditional approval still require supporting implementation evidence.
- Supporting documents use the existing single multiple-file selector and drag-and-drop upload.
- The old single decision and confirmation checkbox are replaced by individual decisions.
- All three current decisions are required to record a combined decision. A reviewer whose domain does not apply can explicitly record Not applicable with a comment.
- Combined precedence is Rejected, then On hold, then Conditional approval; otherwise Approved if at least one review is Approved, or Not applicable if all three say Not applicable.
- Changes to classifications or reviewer names flag earlier domain decisions for reconfirmation in this UI.

## Important scope of this increment

This is a frontend increment. Decisions and attachments remain in the open workspace and do not survive refresh. Separate users do not yet share these decisions. UI permissions reuse the existing access APIs, but the new gate records and intake requirement are not yet enforced or persisted by FastAPI.

The current deployment validation has not been redesigned here. Do not interpret the new intake flag as an implemented backend deployment exemption. The next backend increment must persist and enforce gate applicability, individual reviewer decisions, verified actor identities, and combined-decision rules before this is a complete cross-user workflow.

Legacy single-decision gate data is not converted into three reviewer decisions; the new cards must be recorded individually.

## Run and test

In the frontend folder:

    npm run build
    npx vitest run tests/ProductionGate.test.tsx
    npm run dev

Refresh the browser.

1. Import/reimport a project with Pre-Production Gate Required = Yes.
2. Open Production > Pre-Production Gate. Confirm all three assigned names appear as text, with no editable name fields.
3. As the assigned EA, confirm only the EA decision and comments are editable. Security and RAI should be read-only. Repeat with the assigned Security and RAI users. Admin can edit all three.
4. Confirm an additional reviewer or general user cannot record a primary reviewer decision.
5. Select On hold and enter a comment, then record that domain's decision. Confirm the success message and its recorded status/time.
6. For Approved or Conditional approval, first upload evidence. Confirm recording without evidence shows a validation message.
7. As Admin, record all three decisions in the same open workspace to check the combined result. Do not refresh between these steps; persistence is not connected yet.
8. Reimport with No, blank, or remove the field. Confirm all decisions/comments and upload are disabled. Reimport with Yes to enable again.
9. Confirm both Production sub-tabs and the existing Go-Live and LeanIX form still appear.

Verification completed: TypeScript/Vite production build passed and all 8 new UI/parser tests passed. The existing bundle-size advisory remains.
