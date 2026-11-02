// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import EAMeetingReview from "../src/EAMeetingReview";
import type {EAMeeting,EAReviewVersion} from "../src/api/eaReviews";
const mocks=vi.hoisted(() => ({index:vi.fn(),get:vi.fn(),create:vi.fn(),upload:vi.fn(),generate:vi.fn(),edit:vi.fn(),accept:vi.fn(),remove:vi.fn(),download:vi.fn(),recover:vi.fn(),reopen:vi.fn(),proposal:vi.fn()}));
vi.mock("../src/api/eaReviews",()=>({getEAMeetings:mocks.index,getEAMeeting:mocks.get,createEAMeeting:mocks.create,
  uploadEATranscript:mocks.upload,generateEAReview:mocks.generate,editEAReview:mocks.edit,acceptEAReview:mocks.accept,
  removeEATranscript:mocks.remove,downloadEATranscript:mocks.download,recoverEAReview:mocks.recover,reopenEAReview:mocks.reopen,saveEAProposal:mocks.proposal}));
const accepted:EAReviewVersion={id:"r1",version:1,status:"Accepted",text:"Accepted first meeting review: retention 30 days.",
  basisReviewId:null,parentReviewId:null,createdAt:"2026-10-31T10:00:00Z",createdBy:"EA",acceptedAt:"2026-10-31T10:00:00Z",acceptedBy:"EA",canRecover:false};
let first:EAMeeting,second:EAMeeting;
beforeEach(()=>{
  vi.clearAllMocks();
  first={id:"m1",number:1,title:"Meeting 1",state:"Accepted",revision:4,createdAt:"2026-10-31T10:00:00Z",canEdit:false,canAccept:false,transcripts:[],reviews:[accepted]};
  second={id:"m2",number:2,title:"Meeting 2",state:"Open",revision:2,createdAt:"2026-10-31T11:00:00Z",canEdit:true,canAccept:true,
    transcripts:[{id:"f2",fileName:"second.txt",sizeBytes:100,status:"Ready",uploadedAt:"2026-10-31T11:00:00Z"}],reviews:[]};
  mocks.index.mockImplementation(async()=>({meetings:[first,second],canEdit:true,latestAcceptedReview:second.state==="Accepted"?second.reviews.at(-1):null}));
  mocks.get.mockImplementation(async(_d,id)=>structuredClone(id==="m1"?first:second));
  mocks.generate.mockImplementation(async()=>{const row={...accepted,id:"r2",status:"Draft",text:"Consolidated second review",basisReviewId:"r1",acceptedAt:null,acceptedBy:null};second.reviews.push(row as EAReviewVersion);second.revision++;return row;});
  mocks.edit.mockImplementation(async(_d,_m,_id,parent,text)=>{const row={...second.reviews.at(-1)!,id:"edit2",version:2,text,parentReviewId:parent};second.reviews.push(row);second.revision++;return row;});
  mocks.proposal.mockImplementation(async(_d,_m,_revision,value)=>{
    second.proposal={...value,updatedAt:"2026-11-01T10:00:00Z",updatedBy:"EA"};second.revision++;
    return structuredClone(second);
  });
  mocks.accept.mockImplementation(async()=>{const row=second.reviews.at(-1)!;row.status="Accepted";row.acceptedAt="2026-10-31T12:00:00Z";row.acceptedBy="EA";second.state="Accepted";second.canEdit=false;second.canAccept=false;second.canReopen=true;second.revision++;return row;});
});
afterEach(cleanup);
function show(callback=vi.fn(),canEdit=true){return render(<EAMeetingReview demandId="3845" canEdit={canEdit} beforeGenerate={async()=>{}} onAcceptedReviewChange={callback}/>);}
it("shows AI output read-only, accepts it and preserves history",async()=>{
  const callback=vi.fn();const view=show(callback);
  await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByText("Consolidated second review");
  expect(screen.queryByLabelText("Consolidated review")).toBeNull();
  expect(screen.queryByRole("button",{name:"Save review changes"})).toBeNull();
  expect(screen.queryByText("Edit review text")).toBeNull();
  expect(mocks.edit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Accept meeting review"}));
  expect(mocks.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Confirm acceptance"}));
  await screen.findByRole("button",{name:"Reopen accepted review"});
  expect(callback).toHaveBeenCalledWith(expect.objectContaining({text:"Consolidated second review",acceptedAt:"2026-10-31T12:00:00Z"}));
  fireEvent.change(screen.getByLabelText("Review workspace"),{target:{value:"m1"}});
  await screen.findByText(accepted.text!);
  expect(screen.queryByLabelText("Consolidated review")).toBeNull();
  view.unmount();show(callback);
  expect(await screen.findByText("Consolidated second review")).toBeTruthy();
});
it("sends original files to storage only when Save transcripts is clicked",async()=>{
  show();await screen.findByText("second.txt");
  const file=new File(["New meeting transcript"],"extra.txt",{type:"text/plain"});
  Object.defineProperty(file,"text",{value:async()=>"New meeting transcript"});
  fireEvent.change(screen.getByLabelText("Meeting transcript files"),{target:{files:[file]}});
  await screen.findByText("1 transcript attached");expect(mocks.upload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Save transcripts"}));
  await screen.findByText("Transcripts saved to storage.");
  expect(mocks.upload.mock.calls[0][4]).toBe(file);
});
it("keeps viewers read-only",async()=>{
  show(vi.fn(),false);await screen.findByText("second.txt");
  expect((screen.getByRole("button",{name:"Review meeting with AI"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Browse files"}) as HTMLButtonElement).disabled).toBe(true);
});
it("shows AI failures without substituting a demo review",async()=>{
  mocks.generate.mockRejectedValue(new Error("Invalid citations"));show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Invalid citations");
  expect(screen.queryByLabelText("Consolidated review")).toBeNull();
});

it("opens saved-file previews in a dialog and allows reading for viewers", async()=>{
  mocks.download.mockResolvedValue({text:async()=>"Original transcript contents"});
  show(vi.fn(),false);await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Preview"}));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Original transcript contents")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Close preview"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
});
it("starts a browser download from a DOM-attached link",async()=>{
  const blob=new Blob(["Transcript"]);
  mocks.download.mockResolvedValue(blob);
  Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:download-test")});
  Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
  let attached=false;
  const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){attached=document.body.contains(this);});
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Download"}));
  await screen.findByText("Download started: second.txt");
  expect(attached).toBe(true);expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  click.mockRestore();
});
it("removes saved transcript rows after successful API removal",async()=>{
  mocks.remove.mockImplementation(async()=>{second.transcripts=[];second.revision++;});
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Delete file"}));
  await screen.findByText("Transcript deleted from storage and database. Regenerate any draft based on it.");
  expect(screen.queryByText("second.txt")).toBeNull();
});
it("shows prominent upload progress and success feedback",async()=>{
  let finish!:()=>void;
  mocks.upload.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  show();await screen.findByText("second.txt");
  const file=new File(["Text"],"extra.txt",{type:"text/plain"});
  Object.defineProperty(file,"text",{value:async()=>"Text"});
  fireEvent.change(screen.getByLabelText("Meeting transcript files"),{target:{files:[file]}});
  await screen.findByText("1 transcript attached");
  fireEvent.click(screen.getByRole("button",{name:"Save transcripts"}));
  expect(screen.getByText("Saving transcripts…").closest(".ea-review-feedback--progress")).toBeTruthy();
  expect(screen.getByText("Saving transcripts…").tagName).toBe("STRONG");
  finish();
  expect((await screen.findByText("Transcripts saved to storage.")).closest(".ea-review-feedback--success")).toBeTruthy();
});

it("keeps failed deletions visible, blocks review and offers a retry",async()=>{
  mocks.remove.mockImplementationOnce(async()=>{
    second.transcripts[0].status="Deleting";
    throw new Error("Storage deletion failed. This transcript is excluded from AI. Retry deletion.");
  });
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Delete file"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Storage deletion failed");
  expect(screen.getByText("second.txt")).toBeTruthy();
  expect((screen.getByRole("button",{name:"Review meeting with AI"}) as HTMLButtonElement).disabled).toBe(true);
  mocks.remove.mockImplementationOnce(async()=>{second.transcripts=[];});
  fireEvent.click(screen.getByRole("button",{name:"Retry deletion"}));
  await screen.findByText("Transcript deleted from storage and database. Regenerate any draft based on it.");
  expect(screen.queryByText("second.txt")).toBeNull();
});

it("reopens the accepted workspace with a reason and keeps its accepted version read-only",async()=>{
  const callback=vi.fn();
  const final={...accepted,id:"final",text:"Accepted current review"};
  second.state="Accepted";second.canEdit=false;second.canAccept=false;second.canReopen=true;
  second.isCurrent=true;second.reviews=[final];
  mocks.reopen.mockImplementation(async(_d,id,_uid,_rev,reason)=>{
    expect(id).toBe("m2");expect(reason).toBe("New stakeholder answers");
    second.state="Open";second.canEdit=true;second.canAccept=true;second.canReopen=false;
    second.reviews.push({...final,id:"reopened",version:2,status:"Draft",parentReviewId:"final",acceptedAt:null,acceptedBy:null});
    second.reopenHistory=[{id:"event",reason,createdAt:"2026-11-01T10:00:00Z",createdBy:"EA",acceptedReviewId:"final",draftReviewId:"reopened"}];
    return structuredClone(second);
  });
  show(callback);
  await screen.findByText("Accepted current review");
  expect(screen.queryByRole("button",{name:"Start next meeting"})).toBeNull();
  expect(screen.queryByLabelText("Consolidated review")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Reopen accepted review"}));
  const submit=screen.getByRole("button",{name:"Reopen review"}) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Reason for reopening"),{target:{value:"New stakeholder answers"}});
  fireEvent.click(submit);
  await screen.findByText("Review reopened. Add transcripts here and regenerate; the accepted version remains in history.");
  expect(mocks.reopen).toHaveBeenCalledOnce();
  expect(screen.getByRole("button",{name:"Browse files"})).toBeTruthy();
  expect(callback).toHaveBeenLastCalledWith(null);
  fireEvent.change(screen.getByLabelText("Review version"),{target:{value:"final"}});
  expect(screen.queryByLabelText("Consolidated review")).toBeNull();
  expect(second.reviews[0].status).toBe("Accepted");
});

it("does not offer reopening to viewers",async()=>{
  second.state="Accepted";second.canEdit=false;second.canReopen=false;second.reviews=[accepted];
  show(vi.fn(),false);await screen.findByText("second.txt");
  expect(screen.queryByRole("button",{name:"Reopen accepted review"})).toBeNull();
});


it("batches proposal changes and restores the saved proposal after remount",async()=>{
  const view=show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("checkbox",{name:"Azure"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"Foundry"}));
  fireEvent.change(screen.getByLabelText("Proposed technology stack rationale"),{target:{value:"Pilot proposal rationale"}});
  expect(mocks.proposal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Save proposal"}));
  await screen.findByText("Proposed technology stack and rationale saved.");
  expect(mocks.proposal).toHaveBeenCalledOnce();
  expect(mocks.proposal.mock.calls[0][3].technologies).toEqual(["Azure","Foundry"]);
  view.unmount();show();
  await screen.findByDisplayValue("Pilot proposal rationale");
  expect((screen.getByRole("checkbox",{name:"Azure"}) as HTMLInputElement).checked).toBe(true);
});

it("saves pending proposal before AI generation and uses the saved revision",async()=>{
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("checkbox",{name:"Databricks"}));
  fireEvent.change(screen.getByLabelText("Proposed technology stack rationale"),{target:{value:"Data processing proposal"}});
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByText("Consolidated second review");
  expect(mocks.proposal).toHaveBeenCalledOnce();
  expect(mocks.generate.mock.calls[0][3]).toBe(3);
  expect(mocks.proposal.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
});

it("does not invoke AI if proposal saving fails and retains the user's input",async()=>{
  mocks.proposal.mockRejectedValueOnce(new Error("Proposal changed elsewhere. Refresh saved data."));
  show();await screen.findByText("second.txt");
  fireEvent.change(screen.getByLabelText("Proposed technology stack rationale"),{target:{value:"Keep my edits"}});
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByRole("alert");
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Keep my edits")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Discard proposal changes"})).toBeTruthy();
});


it("allows cancellation without accepting, then confirms exactly once",async()=>{
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByText("Consolidated second review");
  fireEvent.click(screen.getByRole("button",{name:"Accept meeting review"}));
  expect(screen.getByRole("dialog").textContent).toContain("does not approve the project");
  expect(mocks.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  expect(mocks.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Accept meeting review"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm acceptance"}));
  await screen.findByRole("button",{name:"Reopen accepted review"});
  expect(mocks.accept).toHaveBeenCalledOnce();
});

it("keeps the confirmation open after an acceptance failure",async()=>{
  mocks.accept.mockRejectedValueOnce(new Error("Review changed. Refresh saved data."));
  show();await screen.findByText("second.txt");
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByText("Consolidated second review");
  fireEvent.click(screen.getByRole("button",{name:"Accept meeting review"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm acceptance"}));
  await waitFor(()=>expect(screen.getByRole("dialog").textContent).toContain("Review changed"));
  expect(second.state).toBe("Open");
});

it("passes the accepted review identity and locked proposal to the human draft UI",async()=>{
  second.state="Accepted";second.canEdit=false;second.canAccept=false;second.isCurrent=true;second.reviews=[accepted];
  second.proposal={technologies:["Power Apps"],rationale:"Locked proposal"};
  const callback=vi.fn();show(callback);
  await screen.findByText(accepted.text!);
  await waitFor(()=>expect(callback).toHaveBeenCalledWith(expect.objectContaining({id:"r1",version:1,
    proposal:{technologies:["Power Apps"],rationale:"Locked proposal"}})));
});
