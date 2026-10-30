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
