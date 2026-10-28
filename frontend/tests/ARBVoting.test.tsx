// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ARBVoting from "../src/ARBVoting";
import type { ARBVotingResult } from "../src/api/projects";

const mocks = vi.hoisted(() => ({
  roles: ["arb-core-team"],
  get: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../src/auth/AuthGate", () => ({ useAuth: () => ({ roles: mocks.roles }) }));
vi.mock("../src/api/projects", () => ({
  getARBVoting: mocks.get,
  saveARBVote: mocks.save,
}));
function result(changes: Partial<ARBVotingResult> = {}): ARBVotingResult {
  return { inFavour: 0, against: 0, total: 0, canVote: true, myVote: null, votes: [], ...changes };
}
beforeEach(() => {
  mocks.roles = ["arb-core-team"];
  mocks.get.mockReset().mockResolvedValue(result());
  mocks.save.mockReset();
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
    expect(mocks.save).toHaveBeenCalledWith("3601", "For", null, 0);
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
    expect(mocks.save).toHaveBeenCalledWith("3601", "Against", "Need controls", 4);
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
