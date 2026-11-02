import {useEffect, useState} from "react";
import {Badge, Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  DialogActions, MessageBar, MessageBarBody, Select, Textarea} from "@fluentui/react-components";
import type {AcceptedMeetingReview, Project} from "./types";
import type {CurrentDiagramReference} from "./ArchitectureDiagrams";
import EAReviewReader from "./EAReviewReader";
import "./EAMeetingReview.css";
import "./EAFinalAssessment.css";

type Complexity = "" | "Low" | "Medium" | "High";
type Decision = "" | "Approved" | "Conditional approval" | "On hold" | "Rejected";
interface ReportItem {id:string; description:string; comments:string; status:"Open"|"Closed"}
interface Draft {
  text:string; technologyStack:string; rationale:string; conditions:string;
  complexity:Complexity; decision:Decision; comments:string;
  source:AcceptedMeetingReview;
}
interface Snapshot {draft:Draft; savedAt:string; version:number}
interface Props {
  canClose:boolean; readOnly?:boolean; project:Project; items:ReportItem[];
  currentDiagram:CurrentDiagramReference|null; acceptedReview:AcceptedMeetingReview|null;
}

/** UI-only draft. Never calls a final-decision API or updates portfolio status. */
export default function EAApprovalReport({canClose,readOnly=false,project,items,currentDiagram,acceptedReview}:Props) {
  const [draft,setDraft]=useState<Draft|null>(null);
  const [snapshots,setSnapshots]=useState<Snapshot[]>([]);
  const [dirty,setDirty]=useState(false);
  const [notice,setNotice]=useState("");
  const [replaceOpen,setReplaceOpen]=useState(false);
  const canEdit=canClose && !readOnly;
  const sourceChanged=Boolean(draft && (!acceptedReview ||
    draft.source.id!==acceptedReview.id || draft.source.acceptedAt!==acceptedReview.acceptedAt ||
    draft.source.text!==acceptedReview.text));
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(draft){e.preventDefault();e.returnValue="";}};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[draft]);

  function createDraft() {
    if(!canEdit || !acceptedReview) return;
    const proposal=acceptedReview.proposal;
    const fallback=[...(project.eaTechnologyStack??[]),project.eaTechnologyStackOther??""].filter(Boolean).join(", ");
    setDraft({text:acceptedReview.text,
      technologyStack:proposal ? proposal.technologies.join(", ") : fallback,
      rationale:proposal?.rationale??"",conditions:"",complexity:"",decision:"",comments:"",
      source:{...acceptedReview,proposal:proposal ? {...proposal,technologies:[...proposal.technologies]} : undefined}});
    setDirty(true);setReplaceOpen(false);
    setNotice("Local human assessment draft created. Confirm the final technology stack and enter your own complexity and decision.");
  }
  function change(patch:Partial<Draft>) {
    if(!canEdit) return;
    setDraft(value=>value ? {...value,...patch} : value);setDirty(true);setNotice("");
  }
  function saveDraft() {
    if(!canEdit || !draft) return;
    const snapshot={draft:structuredClone(draft),savedAt:new Date().toISOString(),version:snapshots.length+1};
    setSnapshots(value=>[...value,snapshot]);setDirty(false);
    setNotice("Human review saved in this page session only. Download a copy before refreshing or leaving the project.");
  }
  function download(snapshot:Snapshot) {
    const d=snapshot.draft;
    const text=["# Human EA assessment — LOCAL DRAFT",`Project: ${project.name}`,`Demand: ${project.demandId}`,
      `Draft snapshot: ${snapshot.version}`,`Saved locally: ${snapshot.savedAt}`,
      `Source accepted review: ${d.source.id??"ID unavailable"} · version ${d.source.version??"unavailable"} · accepted ${d.source.acceptedAt}`,
      "## Final technology stack",d.technologyStack||"Not entered","## Technology rationale",d.rationale||"Not entered",
      "## Human EA assessment",d.text,"## EA complexity",d.complexity||"Not selected","## Proposed EA decision",d.decision||"Not selected",
      "## Decision rationale",d.comments||"Not entered","## Conditions and outstanding work",d.conditions||"Not entered",
      "This is a local draft, not a submitted EA decision or project approval."].join("\n\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/markdown;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`${project.demandId}-EA-draft-v${snapshot.version}.md`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <section className="content-panel ea-final-assessment" aria-label="Human EA final assessment">
    <div className="panel-heading"><h2>Human EA final review</h2><Badge appearance="tint" color="warning">Local draft · Not submitted</Badge></div>
    <div className="workspace-panel-body">
      <MessageBar intent="info"><MessageBarBody>The AI review is preserved separately. Create your human final review from it, then edit if needed or save the unchanged copy as your own review.
        Drafts and snapshots are held in this page session only and are lost on refresh or leaving the project. Database saving and final submission will be added in the next increment.</MessageBarBody></MessageBar>
      <section aria-label="Accepted review source" className="ea-final-source">
        <h3>AI review source</h3>
        {acceptedReview ? <>
          <p>Accepted: {new Date(acceptedReview.acceptedAt).toLocaleString()}
            {acceptedReview.version!==undefined && ` · Version ${acceptedReview.version}`}</p>
          {acceptedReview.id && <p className="workspace-secondary">Source review ID: {acceptedReview.id}</p>}
          <details><summary>Read AI source review (read-only)</summary><EAReviewReader text={acceptedReview.text}/></details>
        </> : <p>Accept a meeting review in Review meeting before creating the human assessment draft.</p>}
        <Button appearance="primary" disabled={!canEdit || !acceptedReview?.text.trim()} onClick={()=>{if(draft)setReplaceOpen(true);else createDraft();}}>
          {draft ? "Replace draft from accepted review" : "Create human final review from AI review"}</Button>
        {!canEdit && <p className="workspace-secondary">Only the assigned primary EA or Admin can edit this final assessment draft.</p>}
      </section>
      {draft && <section aria-label="Editable human assessment" className="ea-final-draft">
        <h3>Editable human final review</h3>
        <p>Copied from accepted review {draft.source.version!==undefined ? `version ${draft.source.version}` : "version not supplied"} · {new Date(draft.source.acceptedAt).toLocaleString()}.
          You may keep this text unchanged. Saving a copy records your human draft separately; edits do not change the AI source.</p>
        {sourceChanged && <MessageBar intent="warning"><MessageBarBody>The available accepted review has changed or the meeting workspace was reopened.
          Your human draft has been preserved. Inspect its source before replacing it or continuing.</MessageBarBody></MessageBar>}
        <details><summary>Read the source copied into this draft</summary><EAReviewReader text={draft.source.text}/></details>
        <fieldset disabled={!canEdit} className="ea-final-fields">
          <legend>Human EA fields</legend>
          <label className="session-field">Final technology stack<Textarea aria-label="Final technology stack" value={draft.technologyStack}
            maxLength={2000} rows={2} onChange={(_,d)=>change({technologyStack:d.value})} placeholder="Enter the technologies you ultimately recommend…"/></label>
          <p className="workspace-secondary">Initialized from the accepted workspace proposal when available; otherwise existing final stack values are used.
            Confirm these choices independently. The proposal and the final stack may differ.</p>
          <label className="session-field">Technology rationale<Textarea aria-label="Final technology rationale" value={draft.rationale}
            maxLength={4000} rows={3} onChange={(_,d)=>change({rationale:d.value})}/></label>
          <details open><summary>Edit human assessment text</summary>
            <label className="session-field">Final assessment text<Textarea aria-label="Final assessment text" value={draft.text} maxLength={20000} rows={14} resize="vertical"
              onChange={(_,d)=>change({text:d.value})}/></label></details>
          <details><summary>Preview human assessment text</summary><EAReviewReader text={draft.text}/></details>
          <label className="session-field">EA complexity<Select aria-label="Human EA complexity" value={draft.complexity} onChange={(_,d)=>change({complexity:d.value as Complexity})}>
            <option value="">Select complexity</option>{["Low","Medium","High"].map(x=><option key={x}>{x}</option>)}</Select></label>
          <p className="workspace-secondary">Human-selected solution complexity; separate from Security and Responsible AI risk.</p>
          <label className="session-field">EA decision<Select aria-label="Human EA decision" value={draft.decision} onChange={(_,d)=>change({decision:d.value as Decision})}>
            <option value="">Select decision</option>{["Approved","Conditional approval","On hold","Rejected"].map(x=><option key={x}>{x}</option>)}</Select></label>
          <label className="session-field">Decision rationale<Textarea aria-label="Human EA decision rationale" value={draft.comments} maxLength={4000} rows={3} onChange={(_,d)=>change({comments:d.value})}/></label>
          <label className="session-field">Conditions and outstanding work<Textarea aria-label="Human EA conditions" value={draft.conditions} maxLength={4000} rows={3}
            placeholder="Describe conditions, owners and due dates where known. Do not invent missing details."
            onChange={(_,d)=>change({conditions:d.value})}/></label>
        </fieldset>
        <p className="workspace-secondary">Reference only: {items.filter(i=>i.status==="Open").length} open EA items · Current diagram: {currentDiagram?.fileName??"None selected"}.</p>
        <div className="ea-review-toolbar"><Badge color={dirty ? "warning" : "informative"}>{dirty ? "Unsaved local changes" : "Snapshot saved locally"}</Badge>
          <Button appearance="primary" disabled={!canEdit || !dirty} onClick={saveDraft}>Save human review locally</Button>
          <Button disabled>Submit final EA decision</Button></div>
        <p className="workspace-secondary">Final submission is not connected yet. Selecting a decision here does not change project status, complexity or production eligibility.</p>
        {!!snapshots.length && <details><summary>Local draft snapshots ({snapshots.length})</summary>
          {[...snapshots].reverse().map(snapshot=><div key={snapshot.version} className="ea-final-snapshot">
            <span>Draft snapshot {snapshot.version} · {new Date(snapshot.savedAt).toLocaleString()}</span>
            <Button onClick={()=>download(snapshot)}>Download draft {snapshot.version} (.md)</Button>
          </div>)}</details>}
      </section>}
      {notice && <p role="status" className="ea-final-notice"><strong>{notice}</strong></p>}
    </div>
    <Dialog open={replaceOpen} onOpenChange={(_,d)=>setReplaceOpen(d.open)}><DialogSurface><DialogBody>
      <DialogTitle>Replace the human draft?</DialogTitle><DialogContent>Your current editable draft will be replaced with a fresh copy of the currently accepted meeting review.
        Any unsaved human changes will be lost. Saved local snapshots remain available during this page session.</DialogContent>
      <DialogActions><Button onClick={()=>setReplaceOpen(false)}>Keep my draft</Button><Button appearance="primary" disabled={!canEdit || !acceptedReview} onClick={createDraft}>Replace draft</Button></DialogActions>
    </DialogBody></DialogSurface></Dialog>
  </section>;
}
