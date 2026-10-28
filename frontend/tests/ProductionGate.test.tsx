// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProductionGate from "../src/ProductionGate";
import type { Project } from "../src/types";
import type { GateState } from "../src/api/projects";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), toggle: vi.fn(), update: vi.fn() }));
vi.mock("../src/ProjectUpdates", () => ({ useProjectUpdate: () => mocks.update }));
vi.mock("../src/api/projects", () => ({ getPreProductionGate: mocks.get, saveGateDecision: mocks.save, changeGateApplicability: mocks.toggle, getGateAttachments: vi.fn(async () => ({ items: [] })) }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
function state(changes: Partial<GateState> = {}): GateState {
  return { required: true, projectRevision: 2, canChangeApplicability: false, combinedStatus: "Awaiting decisions",
    reviewers: ["EA", "Security", "RAI"].map((domain) => ({ domain: domain as "EA" | "Security" | "RAI", reviewer: `${domain}@example.com`,
      canEdit: domain === "EA", revision: 0, current: false, saved: null })), history: [], ...changes };
}
beforeEach(() => { mocks.get.mockReset().mockResolvedValue(state()); mocks.save.mockReset(); mocks.toggle.mockReset(); mocks.update.mockReset(); });
const project = { demandId: "3601", name: "Example", assignedEA: "EA@example.com", eaComplexity: "Low", securityRisk: "Low", raiRisk: "Low", raiStatus: "Pending" } as Project;

it("uses backend names and restricts each reviewer to their permitted domain", async () => {
  render(<ProductionGate project={project} />);
  await screen.findByText("EA@example.com");
  expect((screen.getByLabelText("EA decision") as HTMLSelectElement).disabled).toBe(false);
  expect((screen.getByLabelText("Security decision") as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
});
it("hides the form but retains the Admin checkbox when not required", async () => {
  mocks.get.mockResolvedValue(state({ required: false, canChangeApplicability: true, combinedStatus: "Not required" }));
  render(<ProductionGate project={project} />);
  await screen.findByText("Not required");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false);
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("saves Admin applicability before showing the form", async () => {
  mocks.get.mockResolvedValue(state({ required: false, canChangeApplicability: true, combinedStatus: "Not required" }));
  mocks.toggle.mockResolvedValue(state({ canChangeApplicability: true, projectRevision: 3 }));
  render(<ProductionGate project={project} />);
  await screen.findByText("Not required");
  fireEvent.click(screen.getByRole("checkbox"));
  await screen.findByLabelText("EA decision");
  expect(mocks.toggle).toHaveBeenCalledWith("3601", true, 2);
});
it("permits an approval without attachments and locks it until Edit decision", async () => {
  const result = state();
  const saved = { id: "event-1", domain: "EA" as const, revision: 1, decision: "Approved" as const, comments: "Checked", reviewerName: "EA@example.com", actorName: "EA", recordedAt: "2026-10-28T10:00:00Z" };
  result.reviewers[0] = { ...result.reviewers[0], saved, revision: 1, current: true }; result.history = [saved];
  mocks.save.mockResolvedValue(result);
  render(<ProductionGate project={project} />);
  await screen.findByLabelText("EA decision");
  fireEvent.change(screen.getByLabelText("EA decision"), { target: { value: "Approved" } });
  fireEvent.change(screen.getByLabelText("EA review comments"), { target: { value: "Checked" } });
  fireEvent.click(screen.getByRole("button", { name: "Record EA decision" }));
  await screen.findByText("EA decision saved.");
  expect(mocks.save).toHaveBeenCalledWith("3601", "EA", "Approved", "Checked", 0);
  const card = within(screen.getByRole("region", { name: "EA gate review" }));
  await waitFor(() => expect((card.getByLabelText("EA decision") as HTMLSelectElement).disabled).toBe(true));
  fireEvent.click(card.getByRole("button", { name: "Edit decision" }));
  expect((card.getByLabelText("EA decision") as HTMLSelectElement).disabled).toBe(false);
});
it("shows a save error without claiming success", async () => {
  mocks.save.mockRejectedValue(new Error("Decision changed"));
  render(<ProductionGate project={project} />);
  await screen.findByLabelText("EA decision");
  fireEvent.change(screen.getByLabelText("EA decision"), { target: { value: "On hold" } });
  fireEvent.change(screen.getByLabelText("EA review comments"), { target: { value: "Confirm" } });
  fireEvent.click(screen.getByRole("button", { name: "Record EA decision" }));
  await screen.findByText("Decision changed");
  expect(screen.queryByText("EA decision saved.")).toBeNull();
});
it("does not fetch when its tab is inactive", () => {
  render(<ProductionGate project={project} active={false} />);
  expect(mocks.get).not.toHaveBeenCalled();
});
it("preserves an unsaved comment when a poll returns the same saved revision", async () => {
  vi.useFakeTimers();
  render(<ProductionGate project={project} />);
  await import("@testing-library/react").then(async ({ act }) => { await act(async () => { await Promise.resolve(); }); });
  fireEvent.change(screen.getByLabelText("EA review comments"), { target: { value: "In progress" } });
  await import("@testing-library/react").then(async ({ act }) => { await act(async () => { await vi.advanceTimersByTimeAsync(15000); }); });
  expect((screen.getByLabelText("EA review comments") as HTMLTextAreaElement).value).toBe("In progress");
  expect(mocks.get.mock.calls.length).toBeGreaterThan(1);
});
