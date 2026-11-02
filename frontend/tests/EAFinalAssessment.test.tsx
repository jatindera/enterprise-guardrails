// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import EAApprovalReport from "../src/EAApprovalReport";
import EAAssessment from "../src/EAAssessment";
import {ProjectUpdateContext} from "../src/ProjectUpdates";
import type {AcceptedMeetingReview,Project} from "../src/types";
vi.mock("../src/ArchitectureDiagrams",()=>({default:()=> <section>Existing architecture diagrams</section>}));
beforeEach(()=>{
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const project={demandId:"5276",name:"Supplier tracker",assignedEA:"ea@example.test",eaComplexity:"High",eaStatus:"Approved"} as Project;
const accepted:AcceptedMeetingReview={id:"review-1",version:2,text:"Consolidated meeting review\n\nHuman-readable accepted evidence.",acceptedAt:"2026-11-02T05:00:00Z",
  proposal:{technologies:["Power Apps","Power Automate"],rationale:"Internal workflow proposal"}};
const props={project,canClose:true,items:[],currentDiagram:null,acceptedReview:accepted};
function create(){fireEvent.click(screen.getByRole("button",{name:"Create human final review from AI review"}));}
it("requires an accepted source and keeps the source readable for viewers",()=>{
  const view=render(<EAApprovalReport {...props} acceptedReview={null}/>);
  expect((screen.getByRole("button",{name:"Create human final review from AI review"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByLabelText("Final assessment text")).toBeNull();
  view.rerender(<EAApprovalReport {...props} canClose={false} readOnly/>);
  expect(screen.getByText("Read AI source review (read-only)")).toBeTruthy();
  expect((screen.getByRole("button",{name:"Create human final review from AI review"}) as HTMLButtonElement).disabled).toBe(true);
});
it("copies once with a compact stack and keeps complexity/decision human-selected",()=>{
  const update=vi.fn();
  render(<ProjectUpdateContext.Provider value={update}><EAApprovalReport {...props}/></ProjectUpdateContext.Provider>);
  create();
  expect((screen.getByLabelText("Final technology stack") as HTMLTextAreaElement).value).toBe("Power Apps, Power Automate");
  expect((screen.getByLabelText("Final technology rationale") as HTMLTextAreaElement).value).toBe("Internal workflow proposal");
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe(accepted.text);
  expect((screen.getByLabelText("Human EA complexity") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText("Human EA decision") as HTMLSelectElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Final assessment text"),{target:{value:"Human final wording"}});
  fireEvent.change(screen.getByLabelText("Human EA complexity"),{target:{value:"Low"}});
  fireEvent.change(screen.getByLabelText("Human EA decision"),{target:{value:"Conditional approval"}});
  fireEvent.click(screen.getByRole("button",{name:"Save human review locally"}));
  expect(screen.getByText("Local draft snapshots (1)")).toBeTruthy();
  expect((screen.getByRole("button",{name:"Submit final EA decision"}) as HTMLButtonElement).disabled).toBe(true);
  expect(update).not.toHaveBeenCalled();
  expect(accepted.text).toContain("Human-readable accepted evidence");
});
it("preserves human edits across accepted-source changes and reopening",()=>{
  const view=render(<EAApprovalReport {...props}/>);create();
  fireEvent.change(screen.getByLabelText("Final assessment text"),{target:{value:"Keep my analysis"}});
  const newer={...accepted,id:"review-2",version:3,text:"New accepted evidence"};
  view.rerender(<EAApprovalReport {...props} acceptedReview={newer}/>);
  expect(screen.getByText(/Your human draft has been preserved/)).toBeTruthy();
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe("Keep my analysis");
  view.rerender(<EAApprovalReport {...props} acceptedReview={null}/>);
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe("Keep my analysis");
  expect(screen.getByText("Read the source copied into this draft")).toBeTruthy();
});
it("requires explicit confirmation to replace a draft and retains saved snapshots",()=>{
  const view=render(<EAApprovalReport {...props}/>);create();
  fireEvent.change(screen.getByLabelText("Final assessment text"),{target:{value:"Human edits"}});
  fireEvent.click(screen.getByRole("button",{name:"Save human review locally"}));
  view.rerender(<EAApprovalReport {...props} acceptedReview={{...accepted,id:"new-review",text:"New accepted wording"}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Replace draft from accepted review"}));
  fireEvent.click(screen.getByRole("button",{name:"Keep my draft"}));
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe("Human edits");
  fireEvent.click(screen.getByRole("button",{name:"Replace draft from accepted review"}));
  fireEvent.click(screen.getByRole("button",{name:"Replace draft",exact:true}));
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe("New accepted wording");
  expect(screen.getByText("Local draft snapshots (1)")).toBeTruthy();
});
it("locks draft editing when primary EA permission is lost",()=>{
  const view=render(<EAApprovalReport {...props}/>);create();
  view.rerender(<EAApprovalReport {...props} canClose={false}/>);
  const text=screen.getByLabelText("Final assessment text") as HTMLTextAreaElement;
  expect((text.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  fireEvent.change(text,{target:{value:"Unauthorized edit"}});
  expect(text.value).toBe(accepted.text);
  expect((screen.getByRole("button",{name:"Save human review locally"}) as HTMLButtonElement).disabled).toBe(true);
});
it("removes the duplicate technology checkbox panel and retains existing diagram and items sections",()=>{
  render(<ProjectUpdateContext.Provider value={vi.fn()}><EAAssessment project={project} acceptedReview={accepted} canClose onOpenReviewSession={()=>{}}/></ProjectUpdateContext.Provider>);
  expect(screen.queryByRole("heading",{name:"Solution technology stack"})).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText("Existing architecture diagrams")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"EA requirements & pending items"})).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Human EA final review"})).toBeTruthy();
});


it("saves an unchanged AI copy as a separate human draft",()=>{
  render(<EAApprovalReport {...props}/>);create();
  fireEvent.click(screen.getByRole("button",{name:"Save human review locally"}));
  expect(screen.getByText("Local draft snapshots (1)")).toBeTruthy();
  expect((screen.getByLabelText("Final assessment text") as HTMLTextAreaElement).value).toBe(accepted.text);
});

it("places the human final review before the diagram section",()=>{
  render(<ProjectUpdateContext.Provider value={vi.fn()}><EAAssessment project={project} acceptedReview={accepted} canClose onOpenReviewSession={()=>{}}/></ProjectUpdateContext.Provider>);
  const review=screen.getByRole("region",{name:"Human EA final assessment"});
  const diagram=screen.getByText("Existing architecture diagrams");
  expect(review.compareDocumentPosition(diagram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
