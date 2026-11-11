// @vitest-environment jsdom
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { chatWithEA, generateEAQuestions, saveMeetingPreparation } from "./api/projects";
import ReviewSession from "./ReviewSession";
import type { Project } from "./types";

vi.mock("./api/projects", () => ({
  getMeetingPreparation: vi.fn(async () => ({preparedQuestions: [], additionalQuestions: [], currentQuestionId: null,
    askedQuestionIds: [], revision: 0, canEdit: true, askedAt: {}})),
  saveMeetingPreparation: vi.fn(async (_id, _domain, data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}})),
  generateEAQuestions: vi.fn(async () => ({ questions: [{question: "Which systems are involved?", reason: "Confirm scope.", priority: "Essential"}] })),
  chatWithEA: vi.fn(async () => ({text: "Clarify boundaries.", proposedQuestion: {question: "Which integrations are needed?", reason: "Confirm scope.", priority: "Follow-up"}})),
}));
const identity = vi.hoisted(() => ({ roles: ["Admin"] as string[] }));
vi.mock("./auth/AuthGate", () => ({ useAuth: () => ({roles: identity.roles}) }));
vi.mock("./MeetingReview", () => ({ default: () => null }));
vi.mock("./TranscriptUpload", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}}));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.clearAllMocks(); identity.roles = ["Admin"]; });
const project: Project = { demandId:"3845", name:"Agent AI",businessFunction:"IT", assignedEA:"Architect", stage:"Architecture review",eaStatus:"Pending", securityStatus:"Pending",raiStatus:"Pending",eaComplexity:"Not assessed",securityRisk:"Not assessed",raiRisk:"Not assessed",nextAction:"Review",overdueActions:0,arbStatus:"Not scheduled" };
function show(domain: "EA" | "Security" | "RAI" = "EA") {
  render(<ReviewSession project={project} preparationDomain={domain} onAcceptedReviewChange={() => {}} />);
}
describe("preparation context", () => {
 it.each(["Admin", "enterprise-architect"])("shows fixed EA for %s and creates EA questions", async (role) => {
   identity.roles=[role]; show();
   expect(screen.getByLabelText("Preparation domain: EA")).toBeTruthy();
   expect(screen.queryByRole("combobox")).toBeNull();
   await waitFor(() => expect((screen.getByRole("button",{name:"Prepare questions with AI"}) as HTMLButtonElement).disabled).toBe(false));
   fireEvent.click(screen.getByRole("button",{name:"Prepare questions with AI"}));
   await waitFor(() => expect(document.querySelectorAll(".prepared-question").length).toBeGreaterThan(0));
   const cards=Array.from(document.querySelectorAll(".prepared-question"));
   expect(cards.length).toBeGreaterThan(0);
   cards.forEach((card) => expect(card.querySelector(".workspace-tags")?.textContent).toContain("EA"));
   fireEvent.click(screen.getByRole("button",{name:"Add my question"}));
   const first=document.querySelector(".prepared-question")!;
   expect(first.textContent).toContain("Your question");
   expect(first.querySelector(".workspace-tags")?.textContent).toContain("EA");
 });
 it.each(["general-users", "security-engineer", "rai-manager"])("shows EA read-only for %s", (role) => {
   identity.roles=[role]; show();
   expect(screen.getByLabelText("Preparation domain: EA")).toBeTruthy();
   for(const name of ["Prepare questions with AI","Add my question","Start meeting","Send"]) expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
   expect(screen.getByText("EA preparation is read-only for your role.")).toBeTruthy();
 });
 it("generates Security questions and saves an explicitly added chat proposal", async () => {
   identity.roles = ["security-engineer"];
   show("Security");
   const generate = screen.getByRole("button", {name:"Prepare questions with AI"}) as HTMLButtonElement;
   await waitFor(() => expect(generate.disabled).toBe(false));
   fireEvent.click(generate);
   await screen.findByDisplayValue("Which systems are involved?");
   expect(generateEAQuestions).toHaveBeenCalledWith("3845", expect.any(AbortSignal), "Security");
   fireEvent.change(screen.getByLabelText("Ask the preparation assistant"), {target:{value:"How should we review SSO?"}});
   fireEvent.click(screen.getByRole("button", {name:"Send"}));
   await screen.findByText("Security assistant");
   expect(chatWithEA).toHaveBeenCalledWith("3845", "How should we review SSO?", [], expect.any(AbortSignal),
     undefined, "prepare", "Security");
   expect(screen.queryByRole("checkbox", {name:"Search web"})).toBeNull();
   expect(screen.queryByDisplayValue("Which integrations are needed?")).toBeNull();
   fireEvent.click(screen.getByRole("button", {name:"Add to meeting questions"}));
   await screen.findByDisplayValue("Which integrations are needed?");
   fireEvent.click(screen.getByRole("button", {name:"Start meeting"}));
   await screen.findByLabelText("Ask the meeting assistant");
   await waitFor(() => expect(saveMeetingPreparation).toHaveBeenCalledWith("3845", "Security",
     expect.objectContaining({preparedQuestions: expect.arrayContaining([
       expect.objectContaining({focus:"Security", question:"Which integrations are needed?", selected:false}),
     ])}), expect.any(Number)));
 });
 it("uses Security meeting chat during Conduct meeting", async () => {
   identity.roles = ["security-engineer"];
   show("Security");
   const start = screen.getByRole("button", {name:"Start meeting"}) as HTMLButtonElement;
   await waitFor(() => expect(start.disabled).toBe(false));
   fireEvent.click(start);
   const message = await screen.findByLabelText("Ask the meeting assistant");
   fireEvent.change(message, {target:{value:"Suggest a follow-up."}});
   fireEvent.click(screen.getByRole("button", {name:"Send"}));
   await screen.findByRole("button", {name:"Add to additional questions"});
   expect(chatWithEA).toHaveBeenCalledWith("3845", "Suggest a follow-up.", [], expect.any(AbortSignal),
     undefined, "meeting", "Security");
   fireEvent.click(screen.getByRole("button", {name:"Add to additional questions"}));
   await waitFor(() => expect(saveMeetingPreparation).toHaveBeenCalledWith("3845", "Security",
     expect.objectContaining({additionalQuestions: expect.arrayContaining([
       expect.objectContaining({focus:"Security", question:"Which integrations are needed?"}),
     ])}), expect.any(Number)));
 });
 it("keeps an unassigned Security reviewer read-only", async () => {
   identity.roles = ["security-engineer"];
   render(<ReviewSession project={project} preparationDomain="Security" canEditOverride={false}
     onAcceptedReviewChange={() => {}} />);
   await screen.findByText(/Security preparation is read-only/);
   const generate = screen.getByRole("button", {name:"Prepare questions with AI"}) as HTMLButtonElement;
   expect(generate.disabled).toBe(true);
   fireEvent.click(generate);
   expect(generateEAQuestions).not.toHaveBeenCalled();
 });
 it("keeps preparation chat in EA context for Admin", async () => {
   show(); await waitFor(() => expect((screen.getByRole("button",{name:"Add my question"}) as HTMLButtonElement).disabled).toBe(false));
   fireEvent.change(screen.getByRole("textbox"),{target:{value:"What about SSO?"}});
   fireEvent.click(screen.getByRole("button",{name:"Send"}));
   await waitFor(() => expect(document.querySelector(".eg-chat-proposal")?.textContent).toContain("EA"));
   expect(document.querySelector(".eg-chat-proposal")?.textContent).not.toContain("Security");
 });
});
