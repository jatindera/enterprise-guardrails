// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import EAMeetingReview from "../src/EAMeetingReview";
import type {EAMeeting,EAReviewVersion} from "../src/api/eaReviews";
const mocks=vi.hoisted(() => ({index:vi.fn(),get:vi.fn(),create:vi.fn(),upload:vi.fn(),generate:vi.fn(),edit:vi.fn(),accept:vi.fn(),remove:vi.fn(),download:vi.fn(),recover:vi.fn()}));
vi.mock("../src/api/eaReviews",()=>({getEAMeetings:mocks.index,getEAMeeting:mocks.get,createEAMeeting:mocks.create,
  uploadEATranscript:mocks.upload,generateEAReview:mocks.generate,editEAReview:mocks.edit,acceptEAReview:mocks.accept,
  removeEATranscript:mocks.remove,downloadEATranscript:mocks.download,recoverEAReview:mocks.recover}));
const accepted:EAReviewVersion={id:"r1",version:1,status:"Accepted",text:"Accepted first meeting review: retention 30 days.",
  basisReviewId:null,parentReviewId:null,createdAt:"2026-10-31T10:00:00Z",createdBy:"EA",acceptedAt:"2026-10-31T10:00:00Z",acceptedBy:"EA",canRecover:false};
let first:EAMeeting,second:EAMeeting;
beforeEach(()=>{
  vi.clearAllMocks();
  first={id:"m1",number:1,title:"Meeting 1",state:"Accepted",revision:4,createdAt:"2026-10-31T10:00:00Z",canEdit:false,canAccept:false,transcripts:[],reviews:[accepted]};
  second={id:"m2",number:2,title:"Meeting 2",state:"Open",revision:2,createdAt:"2026-10-31T11:00:00Z",canEdit:true,canAccept:true,
    transcripts:[{id:"f2",fileName:"second.txt",sizeBytes:100,status:"Ready",uploadedAt:"2026-10-31T11:00:00Z"}],reviews:[]};
  mocks.index.mockImplementation(async()=>({meetings:[first,second],canEdit:true,latestAcceptedReview:second.state==="Accepted"?second.reviews.at(-1):accepted}));
  mocks.get.mockImplementation(async(_d,id)=>structuredClone(id==="m1"?first:second));
  mocks.generate.mockImplementation(async()=>{const row={...accepted,id:"r2",status:"Draft",text:"Consolidated second review",basisReviewId:"r1",acceptedAt:null,acceptedBy:null};second.reviews.push(row as EAReviewVersion);second.revision++;return row;});
  mocks.edit.mockImplementation(async(_d,_m,_id,parent,text)=>{const row={...second.reviews.at(-1)!,id:"edit2",version:2,text,parentReviewId:parent};second.reviews.push(row);second.revision++;return row;});
  mocks.accept.mockImplementation(async()=>{const row=second.reviews.at(-1)!;row.status="Accepted";row.acceptedAt="2026-10-31T12:00:00Z";row.acceptedBy="EA";second.state="Accepted";second.canEdit=false;second.canAccept=false;second.revision++;return row;});
});
afterEach(cleanup);
function show(callback=vi.fn(),canEdit=true){return render(<EAMeetingReview demandId="3845" canEdit={canEdit} beforeGenerate={async()=>{}} onAcceptedReviewChange={callback}/>);}
it("restores prior acceptance, saves edited versions, accepts the latest draft and preserves history",async()=>{
  const callback=vi.fn();const view=show(callback);
  await screen.findByText("second.txt");
  expect(callback).toHaveBeenCalledWith({text:accepted.text,acceptedAt:accepted.acceptedAt});
  fireEvent.click(screen.getByRole("button",{name:"Review meeting with AI"}));
  await screen.findByDisplayValue("Consolidated second review");
  fireEvent.change(screen.getByLabelText("Consolidated review"),{target:{value:"Reviewer-corrected consolidated review"}});
  expect((screen.getByRole("button",{name:"Accept review draft"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Save review changes"}));
  await screen.findByText("A new review version was saved.");
  fireEvent.click(screen.getByRole("button",{name:"Accept review draft"}));
  await screen.findByRole("button",{name:"Start next meeting"});
  expect(callback).toHaveBeenCalledWith({text:"Reviewer-corrected consolidated review",acceptedAt:"2026-10-31T12:00:00Z"});
  fireEvent.change(screen.getByLabelText("Meeting"),{target:{value:"m1"}});
  await screen.findByDisplayValue(accepted.text!);
  expect((screen.getByLabelText("Consolidated review") as HTMLTextAreaElement).disabled).toBe(true);
  view.unmount();show(callback);
  expect(await screen.findByDisplayValue("Reviewer-corrected consolidated review")).toBeTruthy();
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
