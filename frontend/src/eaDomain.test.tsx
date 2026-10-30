// @vitest-environment jsdom
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReviewSession from "./ReviewSession";
import type { Project } from "./types";

vi.mock("./api/projects", () => ({
  generateEAQuestions: vi.fn(async () => ({ questions: [{question: "Which systems are involved?", reason: "Confirm scope.", priority: "Essential"}] })),
  chatWithEA: vi.fn(async () => ({text: "Clarify boundaries.", proposedQuestion: {question: "Which integrations are needed?", reason: "Confirm scope.", priority: "Follow-up"}})),
}));
const identity = vi.hoisted(() => ({ roles: ["Admin"] as string[] }));
vi.mock("./auth/AuthGate", () => ({ useAuth: () => ({roles: identity.roles}) }));
vi.mock("./MeetingReview", () => ({ default: () => null }));
vi.mock("./TranscriptUpload", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}}));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); identity.roles = ["Admin"]; });
const project: Project = { demandId:"3845", name:"Agent AI",businessFunction:"IT", assignedEA:"Architect", stage:"Architecture review",eaStatus:"Pending", securityStatus:"Pending",raiStatus:"Pending",eaComplexity:"Not assessed",securityRisk:"Not assessed",raiRisk:"Not assessed",nextAction:"Review",overdueActions:0,arbStatus:"Not scheduled" };
function show(domain: "EA" | "Security" | "RAI" = "EA") {
  render(<ReviewSession project={project} preparationDomain={domain} onAcceptedReviewChange={() => {}} />);
}
describe("preparation context", () => {
 it.each(["Admin", "enterprise-architect"])("shows fixed EA for %s and creates EA questions", async (role) => {
   identity.roles=[role]; show();
   expect(screen.getByLabelText("Preparation domain: EA")).toBeTruthy();
   expect(screen.queryByRole("combobox")).toBeNull();
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
 it("uses the supplied Security context for later reuse", () => {
   identity.roles=["security-engineer"]; show("Security");
   expect(screen.getByLabelText("Preparation domain: Security")).toBeTruthy();
   fireEvent.click(screen.getByRole("button",{name:"Add my question"}));
   expect(document.querySelector(".prepared-question")?.textContent).toContain("Security");
 });
 it("keeps preparation chat in EA context for Admin", async () => {
   show(); fireEvent.change(screen.getByRole("textbox"),{target:{value:"What about SSO?"}});
   fireEvent.click(screen.getByRole("button",{name:"Send"}));
   await waitFor(() => expect(document.querySelector(".eg-chat-proposal")?.textContent).toContain("EA"));
   expect(document.querySelector(".eg-chat-proposal")?.textContent).not.toContain("Security");
 });
});
