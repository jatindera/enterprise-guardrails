import {useContext, useEffect, useRef, useState} from "react";
import {Badge, Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  DialogActions, MessageBar, MessageBarBody, Select, Textarea} from "@fluentui/react-components";
import type {AcceptedMeetingReview, Project} from "./types";
import type {CurrentDiagramReference} from "./ArchitectureDiagrams";
import {ProjectUpdateContext} from "./ProjectUpdates";
import {createHumanReview, getHumanReview, getHumanVersion, portfolioEAStatus, reopenHumanReview,
  saveHumanReview, submitHumanReview} from "./api/eaHumanReviews";
import type {HumanFields, HumanReview, HumanState, HumanVersion} from "./api/eaHumanReviews";
import EAReviewReader from "./EAReviewReader";
import "./EAMeetingReview.css";
import "./EAFinalAssessment.css";

interface ReportItem {id:string; description:string; comments:string; status:"Open"|"Closed"}
interface Props {
  canClose:boolean; readOnly?:boolean; project:Project; items:ReportItem[];
  currentDiagram:CurrentDiagramReference|null; acceptedReview:AcceptedMeetingReview|null;
}
function fields(row:HumanReview):HumanFields {
  return {reviewText:row.reviewText,technologyStack:row.technologyStack,technologyRationale:row.technologyRationale,
    complexity:row.complexity,decision:row.decision,decisionRationale:row.decisionRationale,conditions:row.conditions};
}

// Remount on demand changes: a late request for another project cannot replace this editor.
export default function EAApprovalReport(props:Props) {
  return <HumanReviewEditor key={props.project.demandId} {...props}/>;
}
function HumanReviewEditor({canClose,readOnly=false,project,items,currentDiagram,acceptedReview}:Props) {
  const updateProject=useContext(ProjectUpdateContext);
  const [state,setState]=useState<HumanState|null>(null);
  const [row,setRow]=useState<HumanReview|null>(null);
  const [draft,setDraft]=useState<HumanFields|null>(null);
  const [dirty,setDirty]=useState(false);
  const dirtyRef=useRef(false);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const mounted=useRef(true);
  const loadSequence=useRef(0);
  const [blocked,setBlocked]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [dialog,setDialog]=useState<"replace"|"submit"|"reopen"|"reload"|null>(null);
  const [reason,setReason]=useState("");
  const [history,setHistory]=useState<HumanVersion|null>(null);
  const historySequence=useRef(0);
  const [historyError,setHistoryError]=useState("");
  const [historyBusy,setHistoryBusy]=useState(false);
  const demand=project.demandId;
  const canEdit=Boolean(canClose && !readOnly && state?.canEdit && !blocked && !busy);
  const canReopen=Boolean(canClose && !readOnly && state?.canReopen && !blocked && !busy);
  const currentSource=acceptedReview?.id;
  const sourceChanged=Boolean(state?.sourceChanged || (row && currentSource && row.sourceReviewId!==currentSource));
  const submitReady=Boolean(draft?.reviewText.trim() && draft.complexity && draft.decision && draft.decisionRationale.trim() &&
    (!['Approved','Conditional approval'].includes(draft.decision) || (draft.technologyStack.trim() && draft.technologyRationale.trim())) &&
    (draft.decision!=='Conditional approval' || draft.conditions.trim()));
  const canSubmit=Boolean(canEdit && row?.status==='Draft' && state?.canSubmit && !sourceChanged && !dirty && submitReady);

  function adopt(next:HumanReview|null) {
    setRow(next);setDraft(next ? fields(next) : null);setDirty(false);dirtyRef.current=false;
  }
  function sync(next:HumanState) {
    setState(next);
    updateProject?.(demand,{eaStatus:portfolioEAStatus(next.eaStatus),eaComplexity:next.eaComplexity,revision:next.projectRevision});
  }
  // Recheck permissions and source freshness when the accepted review or assignment changes.
  // Do not replace any in-progress human edits with a GET response.
  useEffect(()=>{
    mounted.current=true;
    const controller=new AbortController();const sequence=++loadSequence.current;
    getHumanReview(demand,controller.signal).then(next=>{
      if(!mounted.current || sequence!==loadSequence.current || lock.current)return;
      sync(next);
      if(!dirtyRef.current)adopt(next.currentReview);
      else setNotice('Saved state refreshed. Your unsaved human edits are preserved; Save draft will check the revision.');
      setBlocked(false);setError('');
    }).catch(e=>{if(!controller.signal.aborted && mounted.current && sequence===loadSequence.current){setError(e.message);setBlocked(true);}});
    return ()=>{controller.abort();mounted.current=false;};
  // sync uses only the current demand and provider. Avoid refetching on portfolio status updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[demand,currentSource,acceptedReview?.acceptedAt,canClose,readOnly]);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);

  function change(patch:Partial<HumanFields>) {
    if(!canEdit)return;
    setDraft(value=>value ? {...value,...patch} : value);setDirty(true);dirtyRef.current=true;setNotice('');
  }
  async function reload() {
    if(lock.current)return;lock.current=true;setBusy(true);++loadSequence.current;
    try {
      const next=await getHumanReview(demand);
      if(!mounted.current)return;
      sync(next);adopt(next.currentReview);setBlocked(false);setError('');setDialog(null);
      setNotice('Loaded the latest saved human review.');
    }catch(e){if(mounted.current){setError((e as Error).message);setBlocked(true);}}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  }
  async function mutate(operation:()=>Promise<HumanReview>,message:string) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');++loadSequence.current;
    try {
      const saved=await operation();
      if(!mounted.current)return;
      adopt(saved);setDialog(null);setHistory(null);setReason('');setNotice(message);
      // Read fresh project revision, permissions and history after the successful write.
      try {
        const next=await getHumanReview(demand);
        if(mounted.current){sync(next);adopt(next.currentReview);setBlocked(false);}
      }catch(e){if(mounted.current){setBlocked(true);setError(`The operation succeeded, but saved state could not be refreshed. Reload saved review before continuing. ${(e as Error).message}`);}}
    }catch(e){if(mounted.current){
      const status=(e as Error & {status?:number}).status;
      setError(`${(e as Error).message}${status===409 ? ' Your edits are preserved. Copy them if needed, then reload the saved review.' : ''}`);
      // Unknown network outcomes may have committed. Reload rather than silently retrying.
      if(status!==422)setBlocked(true);
    }}finally{lock.current=false;if(mounted.current)setBusy(false);}
  }
  function create() {
    if(!canEdit || !state || !acceptedReview?.id)return;
    void mutate(()=>createHumanReview(demand,crypto.randomUUID(),{
      sourceReviewId:acceptedReview.id!,expectedProjectRevision:state.projectRevision,
      ...(row ? {expectedCurrentReviewId:row.id,expectedCurrentRevision:row.revision,replaceDraft:true}:{}),
    }),'Human review draft saved separately from the AI review.');
  }
  function save() {
    if(!canEdit || !row || !draft)return;
    void mutate(()=>saveHumanReview(demand,row.id,crypto.randomUUID(),{...draft,expectedRevision:row.revision}),
      'Human review draft saved to the database.');
  }
  function submit() {
    if(!canSubmit || !row || !state)return;
    void mutate(()=>submitHumanReview(demand,row.id,crypto.randomUUID(),row.revision,state.projectRevision),
      'Final human EA decision submitted. This version is read-only.');
  }
  function reopen() {
    if(!canReopen || !row || !state || !reason.trim())return;
    void mutate(()=>reopenHumanReview(demand,row.id,crypto.randomUUID(),row.revision,state.projectRevision,reason.trim()),
      'A new human draft was created. The submitted version and reopen reason remain in history.');
  }
  async function readVersion(id:string) {
    const sequence=++historySequence.current;setHistoryBusy(true);setHistoryError('');setHistory(null);
    try{const version=await getHumanVersion(demand,id);if(mounted.current && sequence===historySequence.current)setHistory(version);}
    catch(e){if(mounted.current && sequence===historySequence.current)setHistoryError((e as Error).message);}
    finally{if(mounted.current && sequence===historySequence.current)setHistoryBusy(false);}
  }

  return <section className="content-panel ea-final-assessment" aria-label="Human EA final assessment">
    <div className="panel-heading"><h2>Human EA final review</h2>
      <Badge appearance="tint" color={row?.status==='Submitted' ? 'success' : 'warning'}>{row ? `${row.status} · Version ${row.version} · Revision ${row.revision}` : 'No human review'}</Badge></div>
    <div className="workspace-panel-body" aria-busy={busy}>
      <MessageBar intent="info"><MessageBarBody>The AI review is preserved separately. Your human review is the final assessment.
        Save draft stores your changes together; typing makes no database requests. Save before submitting the final decision.</MessageBarBody></MessageBar>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {!state && !error && <p role="status">Loading saved human review…</p>}
      <Button disabled={busy} onClick={()=>{if(dirty)setDialog('reload');else void reload();}}>Reload saved review</Button>
      <section aria-label="Accepted review source" className="ea-final-source">
        <h3>AI review source</h3>
        {acceptedReview ? <>
          <p>Accepted: {new Date(acceptedReview.acceptedAt).toLocaleString()} · Version {acceptedReview.version??'not supplied'}</p>
          <details><summary>Read AI source review (read-only)</summary><EAReviewReader text={acceptedReview.text}/></details>
        </> : <p>Accept a meeting review in Review meeting before creating the human assessment draft.</p>}
        <Button appearance="primary" disabled={!canEdit || !acceptedReview?.id || !acceptedReview.text.trim()}
          onClick={()=>{if(row)setDialog('replace');else create();}}>
          {row ? 'Replace draft from accepted review' : 'Create human final review from AI review'}</Button>
        {(!canClose || readOnly || (state && !state.canEdit && !state.canReopen && row?.status!=='Submitted')) &&
          <p>Only the assigned primary EA or Admin can edit this final assessment.</p>}
      </section>
      {row && draft && <section aria-label="Editable human assessment" className="ea-final-draft">
        <h3>{row.status==='Submitted' ? 'Submitted human final review' : 'Editable human final review'}</h3>
        <p>Source AI review ID: {row.sourceReviewId}. You may keep the copied text unchanged.</p>
        {sourceChanged && <MessageBar intent="warning"><MessageBarBody>The AI source or meeting evidence has changed.
          Your human review has been preserved. Review the current accepted source before submitting; replacing a draft requires confirmation.</MessageBarBody></MessageBar>}
        {state?.sourceReview?.id===row.sourceReviewId && state.sourceReview.text && <details><summary>Read the source copied into this draft</summary><EAReviewReader text={state.sourceReview.text}/></details>}
        <fieldset disabled={!canEdit} className="ea-final-fields"><legend>Human EA fields</legend>
          <label className="session-field">Final technology stack<Textarea aria-label="Final technology stack" value={draft.technologyStack}
            maxLength={2000} rows={2} onChange={(_,d)=>change({technologyStack:d.value})}/></label>
          <p className="workspace-secondary">Confirm the final choices independently. They may differ from the proposed stack.</p>
          <label className="session-field">Technology rationale<Textarea aria-label="Final technology rationale" value={draft.technologyRationale}
            maxLength={4000} rows={3} onChange={(_,d)=>change({technologyRationale:d.value})}/></label>
          <details open><summary>Edit human assessment text</summary><label className="session-field">Final assessment text
            <Textarea aria-label="Final assessment text" value={draft.reviewText} maxLength={20000} rows={14} resize="vertical"
              onChange={(_,d)=>change({reviewText:d.value})}/></label></details>
          <details><summary>Preview human assessment text</summary><EAReviewReader text={draft.reviewText}/></details>
          <label className="session-field">EA complexity<Select aria-label="Human EA complexity" value={draft.complexity??''}
            onChange={(_,d)=>change({complexity:d.value as HumanFields['complexity'] || null})}>
            <option value="">Select complexity</option>{['Low','Medium','High'].map(x=><option key={x}>{x}</option>)}</Select></label>
          <p className="workspace-secondary">Human-selected solution complexity; separate from Security and Responsible AI risk.</p>
          <label className="session-field">EA decision<Select aria-label="Human EA decision" value={draft.decision??''}
            onChange={(_,d)=>change({decision:d.value as HumanFields['decision'] || null})}>
            <option value="">Select decision</option>{['Approved','Conditional approval','On hold','Rejected'].map(x=><option key={x}>{x}</option>)}</Select></label>
          <label className="session-field">Decision rationale<Textarea aria-label="Human EA decision rationale" value={draft.decisionRationale}
            maxLength={4000} rows={3} onChange={(_,d)=>change({decisionRationale:d.value})}/></label>
          <label className="session-field">Conditions and outstanding work<Textarea aria-label="Human EA conditions" value={draft.conditions}
            maxLength={4000} rows={3} onChange={(_,d)=>change({conditions:d.value})}/></label>
        </fieldset>
        <p className="workspace-secondary">Reference only: {items.filter(i=>i.status==='Open').length} open EA items · Current diagram: {currentDiagram?.fileName??'None selected'}.</p>
        <div className="ea-review-toolbar"><Badge color={dirty ? 'warning' : 'informative'}>{dirty ? 'Unsaved changes' : 'Saved to database'}</Badge>
          <Button appearance="primary" disabled={!canEdit || !dirty || !draft.reviewText.trim()} onClick={save}>Save draft</Button>
          <Button disabled={!canSubmit} onClick={()=>setDialog('submit')}>Submit final EA decision</Button>
          {row.status==='Submitted' && <Button disabled={!canReopen} onClick={()=>setDialog('reopen')}>Reopen human review</Button>}
        </div>
        {row.status==='Draft' && <p>Submission requires saved text, complexity, a decision and decision rationale. Approval requires a final stack and technology rationale; conditional approval also requires conditions.</p>}
        {row.submittedAt && <p>Submitted by {row.submittedBy} · {new Date(row.submittedAt).toLocaleString()}</p>}
      </section>}
      {notice && <p role="status"><strong>{notice}</strong></p>}
      {!!state?.history.length && <details><summary>Saved human review history ({state.history.length})</summary>
        {[...state.history].reverse().map(v=><div key={v.id} className="ea-final-snapshot">
          <span>Version {v.version} · {v.status} · Updated by {v.updatedBy}</span>
          <Button disabled={historyBusy} onClick={()=>void readVersion(v.id)}>View version {v.version}</Button>
        </div>)}
        {historyBusy && <p role="status">Loading version history…</p>}
        {historyError && <p role="alert">{historyError}</p>}
        {history && <section aria-label="Human review history (read-only)"><h3>Version {history.review.version} · {history.review.status}</h3>
          <EAReviewReader text={history.review.reviewText}/>
          {history.snapshots.map(s=><details key={s.id}><summary>{s.action} · Revision {s.review.revision} · {s.recordedBy} · {new Date(s.recordedAt).toLocaleString()}</summary>
            {s.reason && <p>Reason: {s.reason}</p>}<EAReviewReader text={s.review.reviewText}/>
            <p>Stack: {s.review.technologyStack} · Complexity: {s.review.complexity??'Not selected'} · Decision: {s.review.decision??'Not selected'}</p>
            <p>Technology rationale: {s.review.technologyRationale}</p><p>Decision rationale: {s.review.decisionRationale}</p><p>Conditions: {s.review.conditions}</p>
          </details>)}
        </section>}
        {state.events.filter(e=>e.reason).map(e=><p key={e.id}>{e.action} by {e.createdBy}: {e.reason}</p>)}
      </details>}
    </div>
    <Dialog open={dialog!==null} onOpenChange={(_,d)=>{if(!d.open && !busy)setDialog(null);}}><DialogSurface><DialogBody>
      <DialogTitle>{dialog==='submit' ? 'Submit final human EA decision?' : dialog==='reopen' ? 'Reopen human review?' : dialog==='reload' ? 'Reload and discard unsaved edits?' : 'Replace the human draft?'}</DialogTitle>
      <DialogContent>
        {dialog==='submit' && <p>This submits your saved human review as the final EA assessment with decision <strong>{draft?.decision}</strong> and complexity <strong>{draft?.complexity}</strong>.
          The submitted version becomes read-only. It does not grant Security or RAI approval.</p>}
        {dialog==='replace' && <p>A new draft will be copied from the current accepted AI review. The saved human version remains in history; unsaved edits will be discarded.</p>}
        {dialog==='reload' && <p>Your unsaved edits will be discarded. The latest saved version will be loaded from the database.</p>}
        {dialog==='reopen' && <><p>The submitted version remains unchanged. A new draft is created and the project EA status returns to Pending.</p>
          <label className="session-field">Reason for reopening<Textarea aria-label="Human review reopen reason" value={reason} maxLength={1000} disabled={busy} onChange={(_,d)=>setReason(d.value)}/></label></>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={()=>setDialog(null)}>Cancel</Button>
        <Button appearance="primary" disabled={busy || (dialog==='submit' && !canSubmit) || (dialog==='reopen' && (!canReopen || !reason.trim())) || (dialog==='replace' && !canEdit)}
          onClick={()=>{if(dialog==='submit')submit();else if(dialog==='reopen')reopen();else if(dialog==='reload')void reload();else create();}}>
          {dialog==='submit' ? 'Confirm final submission' : dialog==='reopen' ? 'Confirm reopen' : dialog==='reload' ? 'Discard edits and reload' : 'Replace draft'}</Button>
      </DialogActions>
    </DialogBody></DialogSurface></Dialog>
  </section>;
}
