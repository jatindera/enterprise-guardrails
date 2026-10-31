// @vitest-environment jsdom
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import ProjectWorkspace from "./ProjectWorkspace";
import ReviewSession from "./ReviewSession";
import type { Project } from "./types";

vi.mock("./api/projects", () => ({
  getMeetingPreparation: vi.fn(async () => ({preparedQuestions: [], additionalQuestions: [], currentQuestionId: null,
    askedQuestionIds: [], revision: 0, canEdit: true, askedAt: {}})),
  saveMeetingPreparation: vi.fn(async (_id, _domain, data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}})),
  getEAAccess: vi.fn(async () => ({canEdit: true, canClose: true, canManageAdditional: true, revision: 1, primaryResolved: true})),
  getSecurityAccess: vi.fn(async () => ({canEdit: true, revision: 1})),
  getRAIAccess: vi.fn(async () => ({canEdit: true, revision: 1})),
}));
const mockUpdate = vi.hoisted(() => vi.fn());
vi.mock("./auth/AuthGate", () => ({ useAuth: () => ({roles:["Admin"]}) }));
vi.mock("./ProjectUpdates", () => ({ useProjectUpdate: () => mockUpdate }));
vi.mock("./TranscriptUpload", () => ({ default: ({onAttachmentChange}: {onAttachmentChange: (value: unknown) => void}) =>
  <button onClick={() => onAttachmentChange([{id: "test-transcript", sizeBytes: 100, fileName: "meeting.txt", text: "The application reads customer data.", attachedAt: "2026-10-30T00:00:00Z"}])}>Attach test transcript</button>
}));
vi.mock("./ProjectReviewers", () => ({ default: () => null }));
vi.mock("./SecurityRecord", () => ({ default: () => <div>SecurityRecord</div> }));
vi.mock("./RAIAssessment", () => ({ default: () => <div>RAIAssessment</div> }));
vi.mock("./ARBReview", () => ({ default: () => <div>ARBReview</div> }));
vi.mock("./ProductionGate", () => ({ default: () => <div>ProductionGate</div> }));
vi.mock("./ProductionRecord", () => ({ default: () => <div>ProductionRecord</div> }));
vi.mock("./ArchitectureDiagrams", () => ({ default: () => {
  const [text,setText]=useState(""); return <label>Diagram draft<input value={text} onChange={(e)=>setText(e.target.value)} /></label>;
} }));
vi.mock("./EAApprovalReport", () => ({ default: () => {
  const [text,setText]=useState(""); return <label>Approval draft<input value={text} onChange={(e)=>setText(e.target.value)} /></label>;
} }));

beforeAll(() => { vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}}); });
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
const project: Project = {
  revision: 1, demandId:"3845", name:"AI Project", businessFunction:"IT", assignedEA:"Architect", stage:"Architecture review",
  eaStatus:"Pending",securityStatus:"Pending",raiStatus:"Pending",eaComplexity:"Not assessed",securityRisk:"Not assessed",raiRisk:"Not assessed",
  nextAction:"Review",overdueActions:0,arbStatus:"Not scheduled",
};
function goEA() {
 const nav=screen.getByRole("navigation",{name:"Project sections"});
 fireEvent.click(within(nav).getByRole("button",{name:"EA assessment"}));
 return nav;
}

describe("combined EA assessment", () => {
 it("uses one top-level EA tab with the three reusable phases and assessment", () => {
   render(<ProjectWorkspace project={project} onBack={() => {}} onSaveRAIAssignment={async () => {}} />);
   const nav=goEA();
   expect(within(nav).queryByRole("button",{name:"Review session"})).toBeNull();
   expect(within(nav).getAllByRole("button",{name:"EA assessment"})).toHaveLength(1);
   for (const name of ["Prepare", "Conduct meeting", "Review meeting"]) expect(screen.getByRole("button",{name})).toBeTruthy();
   const assessmentButtons=screen.getAllByRole("button",{name:"EA assessment"});
   expect(assessmentButtons).toHaveLength(2);
   fireEvent.click(assessmentButtons[1]);
   expect(screen.getByText("EA requirements & pending items")).toBeTruthy();
   expect(screen.getByRole("button",{name:"Open review meeting"})).toBeTruthy();
 });
 it("retains the meeting selection and EA assessment draft across phase and project section switches", async () => {
   render(<ProjectWorkspace project={project} onBack={() => {}} onSaveRAIAssignment={async () => {}} />);
   const nav=goEA();
   await waitFor(() => expect((screen.getByRole("button",{name:"Add my question"}) as HTMLButtonElement).disabled).toBe(false));
   fireEvent.click(screen.getByRole("button",{name:"Add my question"}));
   const question=screen.getByLabelText("Question") as HTMLTextAreaElement;
   fireEvent.change(question,{target:{value:"My retained question"}});
   fireEvent.click(screen.getAllByRole("button",{name:"EA assessment"})[1]);
   const description=screen.getByPlaceholderText("Describe the EA requirement or pending item…") as HTMLTextAreaElement;
   fireEvent.change(description,{target:{value:"Keep this EA draft"}});
   const diagram=screen.getByLabelText("Diagram draft") as HTMLInputElement;
   const approval=screen.getByLabelText("Approval draft") as HTMLInputElement;
   fireEvent.change(diagram,{target:{value:"Diagram state"}});
   fireEvent.change(approval,{target:{value:"Approval state"}});
   fireEvent.click(screen.getByRole("button",{name:"Prepare"}));
   expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("My retained question");
   fireEvent.click(within(nav).getByRole("button",{name:"Security assessment"}));
   fireEvent.click(within(nav).getByRole("button",{name:"EA assessment"}));
   fireEvent.click(screen.getAllByRole("button",{name:"EA assessment"})[1]);
   expect((screen.getByPlaceholderText("Describe the EA requirement or pending item…") as HTMLTextAreaElement).value).toBe("Keep this EA draft");
   expect((screen.getByLabelText("Diagram draft") as HTMLInputElement).value).toBe("Diagram state");
   expect((screen.getByLabelText("Approval draft") as HTMLInputElement).value).toBe("Approval state");
 });
 it("shows the persistent EA review workspace and returns via Open review meeting", async () => {
   render(<ProjectWorkspace project={project} onBack={() => {}} onSaveRAIAssignment={async () => {}} />);
   goEA();
   fireEvent.click(screen.getByRole("button",{name:"Review meeting"}));
   expect(screen.getByRole("region",{name:"EA meeting review workspace"})).toBeTruthy();
   expect(screen.queryByRole("heading",{name:"Meeting record"})).toBeNull();
   fireEvent.click(screen.getAllByRole("button",{name:"EA assessment"})[1]);
   fireEvent.click(screen.getByRole("button",{name:"Open review meeting"}));
   expect(screen.getByRole("heading",{name:"Meeting reviews"})).toBeTruthy();
 });
 it("makes the three meeting phases reusable without any assessment panel", () => {
   render(<ReviewSession project={project} onAcceptedReviewChange={() => {}} />);
   expect(screen.getByRole("button",{name:"Prepare"})).toBeTruthy();
   expect(screen.getByRole("button",{name:"Conduct meeting"})).toBeTruthy();
   expect(screen.getByRole("button",{name:"Review meeting"})).toBeTruthy();
   expect(screen.queryByRole("button",{name:"EA assessment"})).toBeNull();
 });
 it("accepts a different assessment panel and facilitator for reuse", () => {
   render(<ReviewSession project={project} onAcceptedReviewChange={() => {}} heading="Security review" facilitatorName="Christina Kelly" assessmentTab={{ label:"Security assessment", render: (openReview) => <section><p>Security assessment panel</p><button onClick={openReview}>Return to meeting review</button></section> }} />);
   expect(screen.queryByRole("heading", {name:"Shared review session"})).toBeNull();
   expect(screen.getByText(/Facilitator: Christina Kelly/)).toBeTruthy();
   fireEvent.click(screen.getByRole("button",{name:"Security assessment"}));
   expect(screen.getByText("Security assessment panel")).toBeTruthy();
   fireEvent.click(screen.getByRole("button",{name:"Return to meeting review"}));
   expect(screen.queryByRole("heading",{name:"Meeting record"})).toBeNull();
 });

});
