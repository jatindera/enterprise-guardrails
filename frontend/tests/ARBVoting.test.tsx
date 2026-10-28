// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ARBVoting from "../src/ARBVoting";
import ARBReview from "../src/ARBReview";
import type { Project } from "../src/types";
import type { ARBVotingResult } from "../src/api/projects";

const mocks = vi.hoisted(() => ({
  roles: ["arb-core-team"],
  get: vi.fn(),
  save: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  update: vi.fn(),
  project: vi.fn(),
  applicability: vi.fn(),
}));
vi.mock("../src/ProjectUpdates", () => ({ useProjectUpdate: () => mocks.update }));
vi.mock("../src/auth/AuthGate", () => ({ useAuth: () => ({ roles: mocks.roles }) }));
vi.mock("../src/api/projects", () => ({
  getProject: mocks.project,
  updateARBApplicability: mocks.applicability,
  getARBVoting: mocks.get,
  saveARBVote: mocks.save,
  closeARBVoting: mocks.close,
  reopenARBVoting: mocks.reopen,
}));
function result(changes: Partial<ARBVotingResult> = {}): ARBVotingResult {
  return { roundNumber: 1, currentRoundNumber: 1, status: "Open", outcome: null,
    closedAt: null, closedByName: null, reopenReason: null, canClose: false, canReopen: false,
    rounds: [], inFavour: 0, against: 0, total: 0, canVote: true, myVote: null, votes: [], ...changes };
}
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  mocks.roles = ["arb-core-team"];
  mocks.get.mockReset().mockResolvedValue(result());
  mocks.save.mockReset();
  mocks.close.mockReset();
  mocks.reopen.mockReset();
  mocks.update.mockReset();
  mocks.project.mockReset().mockResolvedValue({ arbRequired: true, revision: 1 });
  mocks.applicability.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ARB voting", () => {
  it("keeps Admin without core role read-only but displays saved totals", async () => {
    mocks.roles = ["Admin"];
    mocks.get.mockResolvedValue(result({ canVote: false, inFavour: 3, against: 1, total: 4 }));
    render(<ARBVoting demandId="3601" active />);
    await screen.findByText("In favour: 3");
    expect(button("Vote in Favour").disabled).toBe(true);
    expect(button("Vote Against").disabled).toBe(true);
    expect(screen.getByText("Against: 1")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires server permission even if the frontend has the core role", async () => {
    mocks.get.mockResolvedValue(result({ canVote: false }));
    render(<ARBVoting demandId="3601" active />);
    await screen.findByText("In favour: 0");
    expect(button("Vote in Favour").disabled).toBe(true);
  });

  it("submits a first vote and displays the persisted timestamp and counts", async () => {
    const saved = result({ inFavour: 1, total: 1, myVote: {
      choice: "For", reason: null, revision: 1, recordedAt: "2026-10-28T10:00:00Z",
    } });
    mocks.save.mockResolvedValue(saved);
    mocks.get.mockResolvedValueOnce(result()).mockResolvedValue(saved);
    render(<ARBVoting demandId="3601" active />);
    await waitFor(() => expect(button("Vote in Favour").disabled).toBe(false));
    fireEvent.click(button("Vote in Favour"));
    await screen.findByText("Your vote is saved.");
    expect(mocks.save).toHaveBeenCalledWith("3601", "For", null, 0, 1);
    expect(screen.getByText(/Your saved vote: In favour/)).toBeTruthy();
    expect(screen.getByText("In favour: 1")).toBeTruthy();
  });

  it("requires and trims an against reason and submits the saved revision", async () => {
    const own = { choice: "For" as const, reason: null, revision: 4, recordedAt: "2026-10-28T10:00:00Z" };
    mocks.get.mockResolvedValue(result({ inFavour: 1, total: 1, myVote: own }));
    mocks.save.mockResolvedValue(result({ against: 1, total: 1, myVote: {
      ...own, choice: "Against", reason: "Need controls", revision: 5,
    } }));
    render(<ARBVoting demandId="3601" active />);
    await waitFor(() => expect(button("Vote Against").disabled).toBe(false));
    fireEvent.click(button("Vote Against"));
    expect(button("Confirm vote against").disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Need controls  " } });
    fireEvent.click(button("Confirm vote against"));
    await screen.findByText("Your vote is saved.");
    expect(mocks.save).toHaveBeenCalledWith("3601", "Against", "Need controls", 4, 1);
  });

  it("shows a failed save without inventing success and refreshes server state", async () => {
    mocks.save.mockRejectedValue(new Error("Your vote changed. Refresh the results before voting again."));
    render(<ARBVoting demandId="3601" active />);
    await waitFor(() => expect(button("Vote in Favour").disabled).toBe(false));
    fireEvent.click(button("Vote in Favour"));
    await screen.findByRole("alert");
    expect(screen.queryByText("Your vote is saved.")).toBeNull();
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("does not fetch or poll while the workspace or voting tab is inactive", () => {
    vi.useFakeTimers();
    render(<ARBVoting demandId="3601" active={false} />);
    vi.advanceTimersByTime(45000);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});



it("refreshes combined totals periodically while active", async () => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValueOnce(result()).mockResolvedValue(result({ inFavour: 2, total: 2 }));
  render(<ARBVoting demandId="3601" active />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText("In favour: 0")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByText("In favour: 2")).toBeTruthy();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});



it("shows saved names in the appropriate groups, with the reason against", async () => {
  mocks.roles = ["general-users"];
  mocks.get.mockResolvedValue(result({
    canVote: false, inFavour: 1, against: 1, total: 2,
    votes: [
      { voterObjectId: "ea-id", voterName: "Jatinder Arora", choice: "For", reason: null,
        revision: 1, recordedAt: "2026-10-28T10:00:00Z" },
      { voterObjectId: "security-id", voterName: "Christina Kelly", choice: "Against",
        reason: "Confirm the identity controls.", revision: 1, recordedAt: "2026-10-28T10:05:00Z" },
    ],
  }));
  const view = render(<ARBVoting demandId="3601" active />);
  await screen.findByText("Jatinder Arora");
  expect(within(screen.getByRole("region", { name: "In favour voters" })).getByText("Jatinder Arora")).toBeTruthy();
  const againstGroup = within(screen.getByRole("region", { name: "Against voters" }));
  expect(againstGroup.getByText("Christina Kelly")).toBeTruthy();
  expect(againstGroup.getByText("Confirm the identity controls.")).toBeTruthy();
  expect(button("Vote in Favour").disabled).toBe(true);
  // A fresh component fetches the same persisted summary, rather than relying on local state.
  view.unmount();
  render(<ARBVoting demandId="3601" active />);
  await screen.findByText("Christina Kelly");
  expect(screen.getByText("Confirm the identity controls.")).toBeTruthy();
});

it("labels legacy votes without inventing a name and displays their reason", async () => {
  mocks.get.mockResolvedValue(result({ against: 1, total: 1, votes: [
    { voterObjectId: "legacy-object-id", voterName: null, choice: "Against", reason: "Original reason",
      revision: 1, recordedAt: "2026-10-28T10:00:00Z" },
  ] }));
  render(<ARBVoting demandId="3601" active />);
  await screen.findByText("Name not recorded");
  expect(screen.getByText("Member ID: legacy-object-id")).toBeTruthy();
  expect(screen.getByText("Original reason")).toBeTruthy();
});



it("lets Admin close voting, then shows locked controls and the stored outcome", async () => {
  mocks.roles = ["Admin"];
  const open = result({ canVote: false, canClose: true, inFavour: 1, total: 1 });
  const closed = result({ canVote: false, canClose: false, canReopen: true,
    inFavour: 1, total: 1, status: "Closed", outcome: "Passed",
    closedAt: "2026-10-28T10:10:00Z", closedByName: "Chief Architect" });
  mocks.get.mockResolvedValueOnce(open).mockResolvedValue(closed);
  mocks.close.mockResolvedValue(closed);
  render(<ARBVoting demandId="3601" active />);
  await screen.findByRole("button", { name: "Close voting" });
  fireEvent.click(button("Close voting"));
  await screen.findByText("Voting is closed. Votes are now locked.");
  expect(mocks.close).toHaveBeenCalledWith("3601", 1);
  expect(screen.getByText("Passed")).toBeTruthy();
  expect(button("Vote in Favour").disabled).toBe(true);
  expect(button("Reopen voting").disabled).toBe(false);
});

it("requires an Admin reopen reason and starts a new empty round", async () => {
  mocks.roles = ["Admin"];
  const closed = result({ canVote: false, canReopen: true, status: "Closed", outcome: "Passed",
    inFavour: 1, total: 1 });
  const reopened = result({ canVote: false, canClose: true, roundNumber: 2, currentRoundNumber: 2,
    reopenReason: "Updated design" });
  mocks.get.mockResolvedValueOnce(closed).mockResolvedValue(reopened);
  mocks.reopen.mockResolvedValue(reopened);
  render(<ARBVoting demandId="3601" active />);
  await screen.findByRole("button", { name: "Reopen voting" });
  fireEvent.click(button("Reopen voting"));
  expect(button("Confirm reopen").disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Reason for reopening (required)" }),
    { target: { value: "  Updated design  " } });
  fireEvent.click(button("Confirm reopen"));
  await screen.findByText("A new voting round is open. All members must vote again.");
  expect(mocks.reopen).toHaveBeenCalledWith("3601", 1, "Updated design");
  expect(screen.getByText("Round 2")).toBeTruthy();
  expect(screen.getByText("In favour: 0")).toBeTruthy();
});

it("loads archived records on expansion while keeping the current round in place", async () => {
  mocks.roles = ["Admin", "arb-core-team"];
  const rounds = [
    { number: 1, status: "Closed" as const, outcome: "Returned for review" as const,
      openedAt: null, openedByName: null, reopenReason: null, closedAt: "2026-10-28T10:00:00Z",
      closedByName: "Chief Architect" },
    { number: 2, status: "Open" as const, outcome: null, openedAt: null, openedByName: "Chief Architect",
      reopenReason: "Updated design", closedAt: null, closedByName: null },
  ];
  const current = result({ roundNumber: 2, currentRoundNumber: 2, canClose: true, rounds });
  const history = result({ currentRoundNumber: 2, status: "Closed", outcome: "Returned for review",
    canVote: false, canClose: false, canReopen: false, rounds, against: 1, total: 1, votes: [
      { voterObjectId: "old-member", voterName: "Original Voter", choice: "Against", reason: "Old concern",
        revision: 1, recordedAt: "2026-10-28T10:00:00Z" },
    ] });
  mocks.get.mockImplementation((_id, _signal, round) => Promise.resolve(round === 1 ? history : current));
  render(<ARBVoting demandId="3601" active />);
  await screen.findByText("Round 2");
  expect(mocks.get.mock.calls.some((call) => call[2] === 1)).toBe(false);
  fireEvent.click(screen.getByText("Previous rounds"));
  await screen.findByText("Original Voter");
  const archive = within(screen.getByRole("article", { name: "Round 1 archived results" }));
  expect(archive.getByText("Old concern")).toBeTruthy();
  expect(archive.queryByRole("button", { name: "Vote in Favour" })).toBeNull();
  expect(screen.queryByRole("button", { name: "View round 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Back to current round" })).toBeNull();
  expect(button("Vote in Favour").disabled).toBe(false);
  expect(screen.getByText("Round 2")).toBeTruthy();
  expect(mocks.get.mock.calls.some((call) => call[2] === 1)).toBe(true);
  fireEvent.click(screen.getByText("Previous rounds"));
  await waitFor(() => expect(screen.queryByText("Original Voter")).toBeNull());
});



it("completes the current portfolio ARB only when a passed round also has EA approval", async () => {
  mocks.roles = ["Admin"];
  mocks.get.mockResolvedValue(result({ status: "Closed", outcome: "Passed", canVote: false,
    canReopen: true, total: 1, inFavour: 1, closedAt: "2026-10-28T10:10:00Z" }));
  const project = { demandId: "3601", assignedEA: "EA", arbRequired: true, arbStatus: "Not scheduled", eaStatus: "Pending" } as Project;
  const view = render(<ARBReview project={project} canEditDocuments active />);
  fireEvent.click(await screen.findByRole("button", { name: "Core Team Vote" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ arbStatus: "In progress", arbCompletionDate: undefined }));
  expect(mocks.update.mock.calls.some(([patch]) => patch.arbStatus === "Completed")).toBe(false);
  view.rerender(<ARBReview project={{ ...project, eaStatus: "Approved" }} canEditDocuments active />);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
    arbStatus: "Completed", arbCompletionDate: "2026-10-28T10:10:00Z",
  }));
});

it("clears completed portfolio status when a new voting round is active", async () => {
  mocks.roles = ["Admin"];
  mocks.get.mockResolvedValue(result({ roundNumber: 2, currentRoundNumber: 2,
    canVote: false, canClose: true, reopenReason: "Re-review" }));
  const project = { demandId: "3601", assignedEA: "EA", arbRequired: true, arbStatus: "Completed",
    eaStatus: "Approved", arbCompletionDate: "2026-10-28T10:10:00Z" } as Project;
  render(<ARBReview project={project} canEditDocuments active />);
  fireEvent.click(await screen.findByRole("button", { name: "Core Team Vote" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ arbStatus: "In progress", arbCompletionDate: undefined }));
});



it("places Core Team Vote first and opens it by default", async () => {
  const project = { demandId: "3601", assignedEA: "EA", arbRequired: true, arbStatus: "Not scheduled", eaStatus: "Pending" } as Project;
  render(<ARBReview project={project} canEditDocuments active />);
  const tabs = within(await screen.findByRole("group", { name: "ARB review sections" })).getAllByRole("button");
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Core Team Vote", "ADR & meeting documents"]);
  expect(tabs[0].getAttribute("aria-pressed")).toBe("true");
  await screen.findByText("In favour: 0");
  expect(mocks.get).toHaveBeenCalled();
});

it("can retry a history load failure without disabling current voting", async () => {
  const rounds = [
    { number: 1, status: "Closed" as const, outcome: "Passed" as const, openedAt: null,
      openedByName: null, reopenReason: null, closedAt: "2026-10-28T10:00:00Z", closedByName: "Chief Architect" },
    { number: 2, status: "Open" as const, outcome: null, openedAt: null,
      openedByName: "Chief Architect", reopenReason: "Re-review", closedAt: null, closedByName: null },
  ];
  const current = result({ roundNumber: 2, currentRoundNumber: 2, rounds });
  let failed = true;
  mocks.get.mockImplementation((_id, _signal, round) => {
    if (round === 1 && failed) return Promise.reject(new Error("Archive temporarily unavailable"));
    return Promise.resolve(round === 1 ? result({ status: "Closed", canVote: false, rounds }) : current);
  });
  render(<ARBVoting demandId="3601" active />);
  await screen.findByText("Round 2");
  fireEvent.click(screen.getByText("Previous rounds"));
  await screen.findByText("Archive temporarily unavailable");
  expect(button("Vote in Favour").disabled).toBe(false);
  failed = false;
  fireEvent.click(button("Retry history"));
  await waitFor(() => expect(screen.queryByText("Archive temporarily unavailable")).toBeNull());
});


it("hides ARB screens for a not-applicable project and keeps a disabled checkbox for non-admin", async () => {
  mocks.project.mockResolvedValue({ arbRequired: false, revision: 3 });
  const project = { demandId: "3601", assignedEA: "EA", arbRequired: false, arbStatus: "Not applicable" } as Project;
  render(<ARBReview project={project} canEditDocuments active />);
  await screen.findByText(/No ARB meeting or voting is required/);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect(checkbox.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Core Team Vote" })).toBeNull();
  expect(mocks.get).not.toHaveBeenCalled();
});

it("lets Admin enable a previously not-applicable ARB and persists before showing tabs", async () => {
  mocks.roles = ["Admin"];
  mocks.project.mockResolvedValue({ arbRequired: false, revision: 3 });
  mocks.applicability.mockResolvedValue({ arbRequired: true, revision: 4 });
  const project = { demandId: "3601", assignedEA: "EA", arbRequired: false, arbStatus: "Not applicable" } as Project;
  render(<ARBReview project={project} canEditDocuments={false} active />);
  await screen.findByText(/No ARB meeting or voting is required/);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.disabled).toBe(false);
  fireEvent.click(checkbox);
  await screen.findByRole("button", { name: "Core Team Vote" });
  expect(mocks.applicability).toHaveBeenCalledWith("3601", true, 3);
  expect(checkbox.checked).toBe(false);
});

it("does not show ARB controls when applicability cannot be loaded", async () => {
  mocks.project.mockRejectedValue(new Error("API unavailable"));
  render(<ARBReview project={{ demandId: "3601", assignedEA: "EA", arbRequired: true } as Project} canEditDocuments active />);
  await screen.findByText("API unavailable");
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Core Team Vote" })).toBeNull();
  expect(mocks.get).not.toHaveBeenCalled();
});
