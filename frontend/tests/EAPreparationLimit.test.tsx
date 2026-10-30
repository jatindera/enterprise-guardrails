// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PreparationChat from "../src/PreparationChat";
import type { Project } from "../src/types";
const mocks = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("../src/api/projects", () => ({ chatWithEA: mocks.chat }));
afterEach(cleanup);
it("explains the history limit without making a billable call", async () => {
  const history = Array.from({length: 21}, (_, i) => ({id: String(i), role: "user" as const, text: "Old question"}));
  render(<PreparationChat project={{demandId: "3845"} as Project} connected scope="EA" messages={history} draft="Next?" questions={[]}
    onMessagesChange={vi.fn()} onDraftChange={vi.fn()} onAddQuestion={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", {name: "Send"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Clear chat");
  expect(mocks.chat).not.toHaveBeenCalled();
});
