// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { projectFromApi, type ProjectRecord } from "../src/api/projects";
import { intakeSuggestionText, projectIntakeContext } from "../src/projectIntakeContext";
import ProjectIntakeDetails from "../src/ProjectIntakeDetails";
import type { IntakeContext } from "../src/IntakeContext";
afterEach(cleanup);
const intake: IntakeContext = {
 version: { snapshotId: "v1", sourceSystem: "sharepoint", sourceItemId: "12", sourceUrl: null, sourceModifiedAt: null, sourceEtag: null, sourceFileName: "", importedAt: "2026-10-30T00:00:00Z", structured: true },
 facts: { problemStatement: "Manual reporting", desiredBusinessOutcome: "Faster reports", aiEffort: false, integrationNeeded: false, budgetAmountUsd: "0.00" },
 stakeholders: [{ role: "Sponsor", displayName: "Example sponsor", email: "sponsor@example.com", sourceValue: "Example sponsor <sponsor@example.com>" }],
 comments: [], sourceFields: [{ ordinal: 1, section: "Custom", fieldName: "Future field", value: "Retained detail", kind: "field" }], parsingWarnings: [],
};
const record = { demandId: "3845", name: "Reporting", businessFunction: "IT", assignedEa: "ea@example.com", intakeContext: intake } as ProjectRecord;
describe("structured intake consumers", () => {
 it("retains detail on list refresh but clears it when detail explicitly returns null", () => {
   const first = projectFromApi(record);
   const { intakeContext: _, ...listRecord } = record;
   expect(projectFromApi(listRecord, first).intakeContext).toEqual(intake);
   expect(projectFromApi({ ...record, intakeContext: null }, first).intakeContext).toBeUndefined();
 });
 it("works without Markdown and displays stakeholders, narratives, false and zero", () => {
   render(<ProjectIntakeDetails project={projectFromApi(record)} />);
   for (const text of ["Manual reporting", "Faster reports", "Example sponsor", "sponsor@example.com", "0.00", "Retained detail"]) expect(screen.getByText(text)).toBeTruthy();
   expect(screen.getAllByText("No").length).toBe(2);
 });
 it("does not infer AI from a false field name or legacy Markdown", () => {
   const project = projectFromApi(record);
   project.intakeSource = { fileName: "legacy.md", importedAt: "", markdown: "AI Foundry obsolete" };
   expect(intakeSuggestionText(project)).not.toMatch(/\bai\b/);
   expect(intakeSuggestionText({ ...project, intakeContext: { ...intake, facts: { aiEffort: true } } })).toMatch(/\bai\b/);
   expect(projectIntakeContext(project)).toContain("Faster reports");
   expect(projectIntakeContext(project)).not.toContain("obsolete");
 });
 it("shows a clear message when backfill is missing", () => {
   render(<ProjectIntakeDetails project={projectFromApi({ ...record, intakeContext: null })} />);
   expect(screen.getByText(/Structured intake is not available/)).toBeTruthy();
 });
});
