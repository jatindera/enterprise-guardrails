// @vitest-environment jsdom
import {afterAll, afterEach, beforeAll, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import ReviewSession from "../src/ReviewSession";
import type {Project} from "../src/types";
import type {MeetingState} from "../src/api/projects";
const mocks = vi.hoisted(() => ({get: vi.fn(), save: vi.fn()}));
vi.mock("../src/auth/AuthGate", () => ({useAuth: () => ({roles: ["Admin"]})}));
vi.mock("../src/api/projects", () => ({getMeetingPreparation: mocks.get, saveMeetingPreparation: mocks.save,
  generateEAQuestions: vi.fn(), chatWithEA: vi.fn()}));
const project = {demandId: "3845", name: "Example", assignedEA: "Architect", businessFunction: "IT"} as Project;
const empty: MeetingState = {preparedQuestions: [], additionalQuestions: [], askedQuestionIds: [], currentQuestionId: null,
  revision: 0, canEdit: true, askedAt: {}};
beforeAll(() => vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}}));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {mocks.get.mockReset().mockResolvedValue(empty); mocks.save.mockReset();});
afterEach(cleanup);
it("waits for the pending save before starting the meeting", async () => {
  let finish!: (value: MeetingState) => void;
  mocks.save.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  render(<ReviewSession project={project} onAcceptedReviewChange={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", {name: "Start meeting"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Add my question"}));
  fireEvent.change(screen.getByLabelText("Question"), {target: {value: "Which systems are involved?"}});
  fireEvent.click(screen.getByRole("button", {name: "Select for meeting"}));
  fireEvent.click(screen.getByRole("button", {name: "Start meeting"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", {name: "Prepare"}).getAttribute("aria-pressed")).toBe("true");
  const draft = mocks.save.mock.calls[0][2];
  expect(draft.preparedQuestions[0].selected).toBe(true);
  await act(async () => {finish({...empty, ...draft, revision: 1});});
  expect(await screen.findByRole("button", {name: "Use question"})).toBeTruthy();
  expect(screen.getByRole("button", {name: "Conduct meeting"}).getAttribute("aria-pressed")).toBe("true");
});
it("restores selected questions, current question and discussion history after remount", async () => {
  const state: MeetingState = {...empty, revision: 4, preparedQuestions: [{id: "saved", focus: "EA", priority: "Essential", source: "ai",
    question: "Which systems are involved?", reason: "Clarify scope", selected: true}],
    currentQuestionId: "saved", askedQuestionIds: ["saved"], askedAt: {saved: "2026-10-30T12:00:00Z"}};
  mocks.get.mockResolvedValue(state);
  const show = () => render(<ReviewSession project={project} onAcceptedReviewChange={vi.fn()} />);
  let view = show();
  await screen.findByDisplayValue("Which systems are involved?");
  fireEvent.click(screen.getByRole("button", {name: "Conduct meeting"}));
  expect(await screen.findByRole("button", {name: "Asked"})).toBeTruthy();
  expect(screen.getByText("Discussion history (1 questions)")).toBeTruthy();
  view.unmount(); view = show();
  await screen.findByDisplayValue("Which systems are involved?");
  fireEvent.click(screen.getByRole("button", {name: "Conduct meeting"}));
  expect(await screen.findByRole("button", {name: "Asked"})).toBeTruthy();
  expect(screen.getAllByText("Which systems are involved?").length).toBeGreaterThan(1);
  expect(mocks.save).not.toHaveBeenCalled();
});
