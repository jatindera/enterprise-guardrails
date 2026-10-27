// @vitest-environment jsdom
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MeetingPreparation from "./MeetingPreparation";
import type { PreparedQuestion } from "./MeetingPreparation";
import PreparationChat from "./PreparationChat";
import type { PreparationChatMessage } from "./PreparationChat";
import ReviewSession from "./ReviewSession";
import type { Project } from "./types";
import type { PreparationScope } from "./auth/preparationAccess";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => vi.unstubAllGlobals());
vi.mock("./MeetingReview", () => ({ default: () => null }));
vi.mock("./TranscriptUpload", () => ({ default: () => null }));

const identity = vi.hoisted(() => ({ roles: ["Admin"] as string[] }));
vi.mock("./auth/AuthGate", () => ({ useAuth: () => ({ roles: identity.roles }) }));
const project = {
  demandId: "3845", name: "AI agent", businessFunction: "IT", assignedEA: "Architect",
  eaComplexity: "Low", intakeSource: { markdown: "Foundry SaaS", fileName: "intake.md", importedAt: "2026-10-26" },
} as Project;
afterEach(() => { cleanup(); identity.roles = ["Admin"]; });
function Harness() {
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [scope, setScope] = useState<PreparationScope>("All");
  return <MeetingPreparation project={project} questions={questions} onQuestionsChange={setQuestions} scope={scope} onScopeChange={setScope} />;
}

describe("preparation controls", () => {
  it.each([["enterprise-architect", "EA"], ["security-engineer", "Security"], ["rai-manager", "RAI"]])("locks %s and generates scoped questions", (role, domain) => {
    identity.roles = [role]; render(<Harness />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.disabled).toBe(true); expect(select.value).toBe(domain);
    expect(Array.from(select.options, (o) => o.value)).toEqual([domain]);
    fireEvent.click(screen.getByRole("button", { name: "Prepare questions with AI" }));
    const cards = document.querySelectorAll(".prepared-question");
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => expect(card.querySelector(".workspace-tags")?.textContent).toContain(domain));
    fireEvent.click(screen.getByRole("button", { name: "Add my question" }));
    const first = document.querySelector(".prepared-question")!;
    expect(first.textContent).toContain("Your question");
    expect(first.textContent).toContain(domain);
    expect((first.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  });
  it("lets Admin choose four scopes without a Joint option", () => {
    render(<Harness />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(Array.from(select.options, (o) => o.value)).toEqual(["All", "EA", "Security", "RAI"]);
    fireEvent.change(select, { target: { value: "Security" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare questions with AI" }));
    document.querySelectorAll(".prepared-question").forEach((card) => expect(card.textContent).toContain("Security"));
  });
  it("keeps other domains unchanged when editing own domain", () => {
    identity.roles = ["enterprise-architect"];
    const other: PreparedQuestion = { id: "s", focus: "Security", priority: "Essential", question: "Security question", reason: "Control", selected: true };
    const onChange = vi.fn();
    render(<MeetingPreparation project={project} questions={[other]} onQuestionsChange={onChange} scope="All" onScopeChange={() => {}} />);
    expect(screen.queryByDisplayValue("Security question")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add my question" }));
    expect(onChange.mock.calls[0][0][1]).toEqual(other);
  });
  it("disables the general user's preparation, chat and Start meeting", () => {
    identity.roles = ["general-users"];
    render(<ReviewSession project={project} onAcceptedReviewChange={() => {}} />);
    for (const name of ["Prepare questions with AI", "Add my question", "Start meeting", "Send"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/Preparation is read-only/)).toBeTruthy();
    screen.getAllByRole("textbox").forEach((box) => expect((box as HTMLTextAreaElement).disabled).toBe(true));
  });
});

function ChatHarness() {
  const [messages, setMessages] = useState<PreparationChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  return <PreparationChat project={project} messages={messages} draft={draft} questions={[]} onMessagesChange={setMessages} onDraftChange={setDraft} onAddQuestion={() => {}} scope="EA" allowedFocuses={["EA"]} />;
}
it("keeps preparation chat proposals in the selected EA domain", () => {
  render(<ChatHarness />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "What about SSO?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(document.querySelector(".preparation-chat-proposal")?.textContent).toContain("EA");
  expect(document.querySelector(".preparation-chat-proposal")?.textContent).not.toContain("Security");
});
