// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MeetingPreparation from "../src/MeetingPreparation";
import PreparationChat from "../src/PreparationChat";
import type { Project } from "../src/types";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), chat: vi.fn() }));
vi.mock("../src/auth/AuthGate", () => ({ useAuth: () => ({ roles: ["enterprise-architect"] }) }));
vi.mock("../src/api/projects", () => ({ generateEAQuestions: mocks.generate, chatWithEA: mocks.chat }));
const project = { demandId: "3845", name: "Example", businessFunction: "IT" } as Project;
const question = { question: "Which integrations are needed?", reason: "Confirm scope.", priority: "Essential" };
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
it("adds generated questions unselected and prevents duplicate clicks while waiting", async () => {
  let resolve!: (value: unknown) => void;
  mocks.generate.mockReturnValue(new Promise(r => { resolve = r; }));
  const change = vi.fn();
  render(<MeetingPreparation project={project} questions={[]} onQuestionsChange={change} scope="EA" />);
  fireEvent.click(screen.getByRole("button", { name: "Prepare questions with AI" }));
  expect((screen.getByRole("button", { name: "Preparing questions…" }) as HTMLButtonElement).disabled).toBe(true);
  resolve({ questions: [question, question] });
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(change.mock.calls[0][0]).toHaveLength(1);
  expect(change.mock.calls[0][0][0].selected).toBe(false);
});
it("keeps manually added questions unselected and respects assignment access", () => {
  const change = vi.fn();
  const view = render(<MeetingPreparation project={project} questions={[]} onQuestionsChange={change} scope="EA" />);
  fireEvent.click(screen.getByRole("button", { name: "Add my question" }));
  expect(change.mock.calls[0][0][0].selected).toBe(false);
  view.rerender(<MeetingPreparation project={project} questions={[]} onQuestionsChange={change} scope="EA" canEditOverride={false} />);
  expect((screen.getByRole("button", { name: "Prepare questions with AI" }) as HTMLButtonElement).disabled).toBe(true);
});
it("sends chat history and displays a real reply with an unselected proposal", async () => {
  mocks.chat.mockResolvedValue({ text: "Clarify boundaries.", proposedQuestion: question });
  const change = vi.fn(); const add = vi.fn(); const clear = vi.fn();
  const props = { project, connected: true, scope: "EA" as const, messages: [{ id: "old", role: "user" as const, text: "We use SaaS." }],
    draft: "What next?", questions: [], onMessagesChange: change, onDraftChange: clear, onAddQuestion: add };
  const view = render(<PreparationChat {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(mocks.chat.mock.calls[0].slice(0, 3)).toEqual(["3845", "What next?", [{ role: "user", text: "We use SaaS." }]]);
  const messages = change.mock.calls[0][0];
  view.rerender(<PreparationChat {...props} messages={messages} draft="" />);
  expect(screen.getByText("Clarify boundaries.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add to meeting questions" }));
  expect(add.mock.calls[0][0].selected).toBe(false);
  expect(screen.queryByText(/Sample replies/)).toBeNull();
});
it("shows service errors without a sample reply and preserves the draft", async () => {
  mocks.chat.mockRejectedValue(new Error("Foundry unavailable"));
  const change = vi.fn(); const draft = vi.fn();
  render(<PreparationChat project={project} connected scope="EA" messages={[]} draft="Question" questions={[]}
    onMessagesChange={change} onDraftChange={draft} onAddQuestion={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(change).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
});

it("shows the welcome message and an accessible waiting indicator until the reply arrives", async () => {
  let resolve!: (value: unknown) => void;
  mocks.chat.mockReturnValue(new Promise(r => { resolve = r; }));
  const change = vi.fn();
  render(<PreparationChat project={project} connected scope="EA" messages={[]} draft="Explain the project" questions={[]}
    onMessagesChange={change} onDraftChange={vi.fn()} onAddQuestion={vi.fn()} />);
  expect(screen.getByText("Let’s prepare for the review")).toBeTruthy();
  expect(screen.getByText(/Explore the project, clarify requirements/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Send"}));
  expect(screen.getByRole("status").textContent).toContain("Preparing a response");
  expect(screen.getByRole("status").querySelector(".eg-chat-wait-spinner")?.getAttribute("aria-hidden")).toBe("true");
  expect((screen.getByRole("button", {name: "Send"}) as HTMLButtonElement).disabled).toBe(true);
  resolve({text: "A useful explanation.", proposedQuestion: null});
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(screen.queryByRole("status")).toBeNull();
});

it("regenerates only unselected AI drafts, preserving manual, selected and other-domain questions", async () => {
  const saved = { id: "saved", focus: "EA" as const, priority: "Essential" as const, question: "Keep selected?", reason: "Selected", selected: true, source: "ai" as const };
  const manual = { ...saved, id: "manual", question: "My own question?", source: "manual" as const, selected: false };
  const old = { ...saved, id: "old", question: "Old AI question?", selected: false };
  const other = { ...old, id: "security", focus: "Security" as const };
  const questions = [manual, saved, old, other];
  mocks.generate.mockResolvedValue({questions: [question, { ...question, question: saved.question }]});
  const change = vi.fn();
  const view = render(<MeetingPreparation project={project} questions={questions} onQuestionsChange={change} scope="EA" />);
  fireEvent.click(screen.getByRole("button", {name: "Regenerate AI questions"}));
  await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  const first = change.mock.calls[0][0];
  expect(first.slice(0, 3)).toEqual([manual, saved, other]);
  expect(first).toHaveLength(4);
  expect(first.find((q: {id: string}) => q.id === "old")).toBeUndefined();
  expect(first[3].selected).toBe(false);
  view.rerender(<MeetingPreparation project={project} questions={first} onQuestionsChange={change} scope="EA" />);
  fireEvent.click(screen.getByRole("button", {name: "Regenerate AI questions"}));
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(change.mock.calls[1][0]).toHaveLength(4);
});

it("keeps the entire question list unchanged if regeneration fails", async () => {
  mocks.generate.mockRejectedValue(new Error("Foundry unavailable"));
  const questions = [{id: "old", focus: "EA" as const, priority: "Essential" as const,
    question: "Retain this draft?", reason: "Original", source: "ai" as const, selected: false}];
  const change = vi.fn();
  render(<MeetingPreparation project={project} questions={questions} onQuestionsChange={change} scope="EA" />);
  fireEvent.click(screen.getByRole("button", {name: "Regenerate AI questions"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Foundry unavailable");
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Retain this draft?")).toBeTruthy();
});

it("sends only the separately entered public query as web options and renders source links", async () => {
  mocks.chat.mockResolvedValue({text: "Published advisory [1].", proposedQuestion: null, webSearched: true,
    sources: [{title: "Microsoft advisory", url: "https://msrc.microsoft.com/update-guide"}], searchedAt: "2026-10-31T09:00:00Z"});
  const change = vi.fn();
  const props = {project, connected: true, scope: "EA" as const, messages: [], draft: "Check this SDK", questions: [],
    onMessagesChange: change, onDraftChange: vi.fn(), onAddQuestion: vi.fn()};
  const view = render(<PreparationChat {...props} />);
  fireEvent.click(screen.getByRole("checkbox", {name: "Search web"}));
  expect((screen.getByRole("button", {name: "Send"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Public technical search query"), {target: {value: "Microsoft Agent 365 SDK advisories"}});
  fireEvent.click(screen.getByRole("button", {name: "Send"}));
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(mocks.chat.mock.calls[0][4]).toEqual({searchWeb: true, publicSearchQuery: "Microsoft Agent 365 SDK advisories"});
  view.rerender(<PreparationChat {...props} messages={change.mock.calls[0][0]} draft="" />);
  const link = screen.getByRole("link", {name: "Microsoft advisory"});
  expect(link.getAttribute("href")).toBe("https://msrc.microsoft.com/update-guide");
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(screen.getByText("Web searched")).toBeTruthy();
});

it("does not expose web search in demo or non-EA chat", () => {
  const props = {project, messages: [], draft: "", questions: [], onMessagesChange: vi.fn(), onDraftChange: vi.fn(), onAddQuestion: vi.fn()};
  const view = render(<PreparationChat {...props} scope="Security" />);
  expect(screen.queryByRole("checkbox", {name: "Search web"})).toBeNull();
  view.rerender(<PreparationChat {...props} scope="RAI" />);
  expect(screen.queryByRole("checkbox", {name: "Search web"})).toBeNull();
});
