// @vitest-environment jsdom
import {afterAll, afterEach, beforeAll, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import ReviewSession from "../src/ReviewSession";
import type {Project} from "../src/types";
import type {MeetingState} from "../src/api/projects";
const mocks = vi.hoisted(() => ({get: vi.fn(), save: vi.fn(), chat: vi.fn()}));
vi.mock("../src/auth/AuthGate", () => ({useAuth: () => ({roles: ["Admin"]})}));
vi.mock("../src/api/projects", () => ({getMeetingPreparation: mocks.get, saveMeetingPreparation: mocks.save,
  generateEAQuestions: vi.fn(), chatWithEA: mocks.chat}));
vi.mock("../src/api/eaReviews", () => ({
  getEAMeetings: async () => ({meetings:[{id:"read-round",title:"Saved meeting",number:1,state:"Open",revision:1}],canEdit:false,latestAcceptedReview:null}),
  getEAMeeting: async () => ({id:"read-round",title:"Saved meeting",number:1,state:"Open",revision:1,canEdit:false,canAccept:false,
    transcripts:[{id:"read-file",fileName:"stored-transcript.txt",status:"Ready",sizeBytes:20}],reviews:[]}),
}));
const project = {demandId: "3845", name: "Example", assignedEA: "Architect", businessFunction: "IT"} as Project;
const empty: MeetingState = {preparedQuestions: [], additionalQuestions: [], askedQuestionIds: [], currentQuestionId: null,
  revision: 0, canEdit: true, askedAt: {}};
beforeAll(() => vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}}));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {mocks.get.mockReset().mockResolvedValue(empty); mocks.save.mockReset(); mocks.chat.mockReset();});
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

it("saves manual and explicitly added AI questions, and restores them after remount", async () => {
  let stored = {...empty};
  mocks.get.mockImplementation(async () => stored);
  mocks.save.mockImplementation(async (_id, _domain, value) => {
    stored = {...stored, ...value, revision: stored.revision + 1};
    return stored;
  });
  mocks.chat.mockResolvedValue({text: "Clarify operational ownership.", proposedQuestion: {
    question: "Who owns incident response?", reason: "Clarify support", priority: "Follow-up"}});
  const show = () => render(<ReviewSession project={project} onAcceptedReviewChange={vi.fn()} />);
  let view = show();
  await waitFor(() => expect((screen.getByRole("button", {name: "Start meeting"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Conduct meeting"}));
  await screen.findByLabelText("Ask the meeting assistant");
  fireEvent.change(screen.getByLabelText("Add a question manually"), {target: {value: "Which integrations need monitoring?"}});
  fireEvent.click(screen.getByRole("button", {name: "Add question"}));
  fireEvent.change(screen.getByLabelText("Ask the meeting assistant"), {target: {value: "Suggest a follow-up"}});
  fireEvent.click(screen.getByRole("button", {name: "Send"}));
  await screen.findByText("Clarify operational ownership.");
  expect(mocks.save).toHaveBeenCalled();
  expect(stored.additionalQuestions).toHaveLength(1); // Suggestions are not autosaved.
  expect(mocks.chat.mock.calls[0][5]).toBe("meeting");
  fireEvent.click(screen.getByRole("button", {name: "Add to additional questions"}));
  await waitFor(() => expect(stored.additionalQuestions).toHaveLength(2), {timeout: 2500});
  expect(stored.askedQuestionIds).toEqual([]);
  view.unmount(); view = show();
  await waitFor(() => expect((screen.getByRole("button", {name: "Start meeting"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Conduct meeting"}));
  expect(await screen.findByText("Who owns incident response?")).toBeTruthy();
  expect(screen.getByText("Which integrations need monitoring?")).toBeTruthy();
});

it("keeps multiple transcript attachments while switching phases and removes Meeting record", async () => {
  render(<ReviewSession project={project} preparationDomain="Security" onAcceptedReviewChange={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", {name: "Start meeting"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Review meeting"}));
  expect(screen.queryByRole("heading", {name: "Meeting record"})).toBeNull();
  const files = ["session-one.txt", "session-two.vtt"].map(name => {
    const file = new File(["Meeting transcript"], name, {type: "text/plain"});
    Object.defineProperty(file, "text", {value: async () => "Meeting transcript"});
    return file;
  });
  fireEvent.change(screen.getByLabelText("Meeting transcript files"), {target: {files}});
  await screen.findByText("2 transcripts attached");
  fireEvent.click(screen.getByRole("button", {name: "Prepare"}));
  fireEvent.click(screen.getByRole("button", {name: "Review meeting"}));
  expect(screen.getByText("session-one.txt")).toBeTruthy();
  expect(screen.getByText("session-two.vtt")).toBeTruthy();
});

it("keeps stored-file read controls outside the disabled reviewer fieldset", async () => {
  render(<ReviewSession project={project} canEditOverride={false} onAcceptedReviewChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", {name: "Review meeting"}));
  await screen.findByText("stored-transcript.txt");
  const preview=screen.getByRole("button", {name: "Preview"});
  expect((preview as HTMLButtonElement).disabled).toBe(false);
  expect(preview.closest("fieldset")?.hasAttribute("disabled")).toBe(false);
  expect((screen.getByRole("button", {name: "Delete file"}) as HTMLButtonElement).disabled).toBe(true);
});
