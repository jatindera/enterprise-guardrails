import {useContext, useEffect, useRef, useState} from "react";
import {Badge, Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  DialogActions, Checkbox, Input, MessageBar, MessageBarBody, Select, Textarea} from "@fluentui/react-components";
import type {AcceptedMeetingReview, Project} from "./types";
import type {CurrentDiagramReference} from "./ArchitectureDiagrams";
import {ProjectUpdateContext} from "./ProjectUpdates";
import {createHumanReview, getHumanReview, getHumanVersion, portfolioEAStatus, reopenHumanReview,
  saveHumanReview, submitHumanReview} from "./api/eaHumanReviews";
import type {HumanFields, HumanReview, HumanState, HumanVersion} from "./api/eaHumanReviews";
import EAReviewReader from "./EAReviewReader";
import "./EAMeetingReview.css";
import "./EAFinalAssessment.css";

interface Props {
  canClose:boolean; readOnly?:boolean; project:Project;
  currentDiagram:CurrentDiagramReference|null; acceptedReview:AcceptedMeetingReview|null;
}
function fields(row:HumanReview):HumanFields {
  return {reviewText:row.reviewText,technologyStack:row.technologyStack,technologyRationale:row.technologyRationale,
    complexity:row.complexity,decision:row.decision,decisionRationale:row.decisionRationale,conditions:row.conditions,diagramId:row.diagramId??null,diagramConfirmed:row.diagramConfirmed??false,
    diagramRequirement:row.diagramRequirement??'Required',diagramJustification:row.diagramJustification??'',diagramOwner:row.diagramOwner??'',diagramDueDate:row.diagramDueDate??null};
}

// Remount on demand changes: a late request for another project cannot replace this editor.
export default function EAApprovalReport(props:Props) {
  return <HumanReviewEditor key={props.project.demandId} {...props}/>;
}
function HumanReviewEditor({canClose,readOnly=false,project,currentDiagram,acceptedReview}:Props) {
  const updateProject=useContext(ProjectUpdateContext);
  const [state,setState]=useState<HumanState|null>(null);
  const [row,setRow]=useState<HumanReview|null>(null);
  const [draft,setDraft]=useState<HumanFields|null>(null);
  const [dirty,setDirty]=useState(false);
  const [preview,setPreview]=useState(false);
  const dirtyRef=useRef(false);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const mounted=useRef(true);
  const loadSequence=useRef(0);
  const [blocked,setBlocked]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [dialog,setDialog]=useState<"replace"|"submit"|"reopen"|"reload"|null>(null);
  const sourceDetails = useRef<HTMLDetailsElement>(null);
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
  const newerSource = row?.status === 'Draft' && Boolean(currentSource && row.sourceReviewId !== currentSource);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const missing: {label: string; target: string}[] = [];
  if (draft) {
    const requireField = (complete: unknown, label: string, target: string) => {
      if (!complete) missing.push({label, target});
    };
    requireField(draft.reviewText.trim(), 'Enter the final assessment', 'review-text');
    requireField(draft.complexity, 'Select the solution complexity', 'complexity');
    requireField(draft.decision, 'Select the EA decision', 'decision');
    requireField(draft.decisionRationale.trim(), 'Enter the decision rationale', 'decision-rationale');
    if (draft.decision === 'Conditional approval') {
      requireField(draft.conditions.trim(), 'Record the approval conditions', 'conditions');
    }
    if (draft.decision === 'Approved' || draft.decision === 'Conditional approval') {
      requireField(draft.technologyStack.trim(), 'Enter the final technology stack', 'technology-stack');
      requireField(draft.technologyRationale.trim(), 'Enter the technology rationale', 'technology-rationale');
      if (draft.diagramRequirement === 'Not applicable' || draft.diagramRequirement === 'Pending') {
        requireField(draft.diagramJustification?.trim(), 'Explain the diagram requirement', 'diagram-justification');
        if (draft.diagramRequirement === 'Pending') {
          requireField(draft.decision === 'Conditional approval', 'Resolve the pending diagram for full approval', 'diagram-requirement');
          requireField(draft.diagramOwner?.trim(), 'Assign a diagram owner', 'diagram-owner');
          requireField(draft.diagramDueDate, 'Set the diagram due date', 'diagram-due-date');
        }
      } else if (!draft.diagramId) {
        missing.push({label: 'Upload or select an architecture diagram', target: 'architecture-diagrams'});
      } else {
        requireField(draft.diagramConfirmed, 'Confirm the selected diagram', 'diagram-confirmed');
      }
    }
  }
  const canSubmit = Boolean(canEdit && row?.status === 'Draft' && state?.canSubmit && !sourceChanged && !dirty && draft && !missing.length);

  function guideTo(target: string) {
    setPreview(false);
    setFocusTarget(target);
  }

  useEffect(() => {
    if (!focusTarget) return;
    const field = document.getElementById(`ea-final-${focusTarget}`);
    field?.focus({preventScroll: true});
    field?.scrollIntoView?.({block: 'center'});
    setFocusTarget(null);
  }, [focusTarget]);

  function adopt(next:HumanReview|null) {
    setRow(next);setDraft(next ? fields(next) : null);setPreview(false);setDirty(false);dirtyRef.current=false;
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
  const lastSelectedDiagram=useRef<string|null>(null);
  useEffect(()=>{
    if(!currentDiagram || currentDiagram.id===lastSelectedDiagram.current)return;
    lastSelectedDiagram.current=currentDiagram.id;
    if(!canClose || readOnly || !state?.canEdit)return;
    setDraft(value=>value ? {...value,diagramId:currentDiagram.id,diagramConfirmed:false,diagramRequirement:'Required'} : value);
    setDirty(true);dirtyRef.current=true;
    setNotice('Diagram selected. Confirm that it represents the assessed solution, then Save draft.');
  },[currentDiagram,canClose,readOnly,state?.canEdit]);
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
    <div className="panel-heading ea-final-heading"><div><span className="ea-final-eyebrow">Enterprise architecture</span><h2>Human EA final review</h2><p>Your assessment, decision and supporting rationale.</p></div>
      <Badge appearance="tint" color={row?.status==='Submitted' ? 'success' : 'warning'}>{row ? `${row.status} · Version ${row.version} · Revision ${row.revision}` : 'No human review'}</Badge></div>
    <div className="workspace-panel-body" aria-busy={busy}>
      {!row && <p className="workspace-secondary">Start from the accepted meeting review, refine your assessment, then record your decision.</p>}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {!state && !error && <p role="status">Loading saved human review…</p>}
      <div className="ea-final-utility"><Button appearance="subtle" disabled={busy} onClick={()=>{if(dirty)setDialog('reload');else void reload();}}>Reload saved review</Button></div>
      {newerSource && acceptedReview && <MessageBar intent="warning">
        <MessageBarBody>
          <strong>New AI review accepted{acceptedReview.version != null && ` · Version ${acceptedReview.version}`}</strong>
          <p>Your human review has been preserved. Review the new AI source before replacing your draft.</p>
          <div className="ea-review-toolbar">
            <Button appearance="primary" disabled={!canEdit || !acceptedReview.text.trim()} onClick={()=>setDialog('replace')}>
              Replace draft from accepted review
            </Button>
            <Button onClick={()=>{
              const details = sourceDetails.current;
              if (!details) return;
              details.open = true;
              const review = details.querySelector('details');
              if (review) review.open = true;
              details.querySelector('summary')?.focus();
              details.scrollIntoView?.({block: 'start'});
            }}>View AI review</Button>
          </div>
        </MessageBarBody>
      </MessageBar>}
      <details ref={sourceDetails} aria-label="Accepted review source" className="ea-final-source" open={!row}>
        <summary>AI review source <span className="ea-final-source-hint">Read-only reference</span></summary>
        {acceptedReview ? <>
          <p>Accepted: {new Date(acceptedReview.acceptedAt).toLocaleString()} · Version {acceptedReview.version??'not supplied'}</p>
          <details><summary>Read AI source review (read-only)</summary><EAReviewReader text={acceptedReview.text}/></details>
        </> : <p>Accept a meeting review in Review meeting before creating the human assessment draft.</p>}
        {(!row || (row.status==='Draft' && !newerSource)) && <Button appearance="primary" disabled={!canEdit || !acceptedReview?.id || !acceptedReview.text.trim()}
          onClick={()=>{if(row)setDialog('replace');else create();}}>
          {row ? 'Replace draft from accepted review' : 'Create human final review from AI review'}</Button>}
        {(!canClose || readOnly || (state && !state.canEdit && !state.canReopen && row?.status!=='Submitted')) &&
          <p>Only the assigned primary EA or Admin can edit this final assessment.</p>}
      </details>
      {row && draft && <section aria-label="Editable human assessment" className="ea-final-draft">
        <h3>{row.status==='Submitted' ? 'Submitted human final review' : 'Editable human final review'}</h3>
        <div className="ea-final-summary">
          <div><span>EA decision</span><strong className={`ea-final-decision ea-final-decision--${draft.decision==='Approved' ? 'approved' : draft.decision==='Rejected' ? 'rejected' : 'pending'}`}>{draft.decision??'Not selected'}</strong></div>
          <div><span>Solution complexity</span><strong>{draft.complexity??'Not selected'}</strong></div>
          <div><span>{row.status==='Submitted' ? 'Submitted by' : 'Last saved by'}</span><strong>{row.submittedBy??row.updatedBy}</strong><small>{new Date(row.submittedAt??row.updatedAt).toLocaleString()}</small></div>
        </div>
        {row.status==='Draft' && <div className="ea-final-mode" role="group" aria-label="Human review display mode">
          <Button appearance={!preview ? 'primary' : 'secondary'} aria-pressed={!preview} onClick={()=>setPreview(false)}>Edit review</Button>
          <Button appearance={preview ? 'primary' : 'secondary'} aria-pressed={preview} onClick={()=>setPreview(true)}>Preview review</Button>
          <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>}
        {sourceChanged && !newerSource && <MessageBar intent="warning"><MessageBarBody>The AI source or meeting evidence has changed.
          Your human review has been preserved. Review the current accepted source before submitting; replacing a draft requires confirmation.</MessageBarBody></MessageBar>}
        {(row.status==='Submitted' || preview) && <section className="ea-final-report" aria-label="Formatted human final review">
          <section><h3>Final technology stack</h3><div className="ea-final-tech-tags">{draft.technologyStack.split(',').filter(x=>x.trim()).map((x,i)=><span key={i}>{x.trim()}</span>)}</div>
            {!draft.technologyStack.trim() && <p>Not recorded</p>}<h4>Technology rationale</h4><p>{draft.technologyRationale||'Not recorded'}</p></section>
          <section><h3>Architecture assessment</h3><EAReviewReader text={draft.reviewText}/></section>
          <section className="ea-final-decision-section"><h3>Decision rationale</h3><p>{draft.decisionRationale||'Not recorded'}</p>
            <h4>Conditions and outstanding work</h4><p>{draft.conditions||'No conditions recorded.'}</p></section>
          <section><h3>Architecture diagram evidence</h3><p>{row.status==='Submitted' && !draft.diagramId && (draft.diagramRequirement??'Required')==='Required' && ['Approved','Conditional approval'].includes(draft.decision??'') ? 'Diagram evidence was not recorded with this earlier submission.' : `${draft.diagramRequirement??'Required'} · ${row.diagramFileName||'No diagram linked'}`}</p>
            {draft.diagramConfirmed&&<p>Human EA confirmed this diagram represents the assessed solution.</p>}
            {draft.diagramJustification&&<p>{draft.diagramJustification}</p>}{draft.diagramOwner&&<p>Owner: {draft.diagramOwner} · Due: {draft.diagramDueDate}</p>}
          </section>
        </section>}
        {row.status!=='Submitted' && !preview && <fieldset disabled={!canEdit} className="ea-final-fields"><legend>1. Solution and rationale</legend>
          <label className="session-field">Final technology stack<Textarea id="ea-final-technology-stack" aria-label="Final technology stack" value={draft.technologyStack}
            maxLength={2000} rows={2} onChange={(_,d)=>change({technologyStack:d.value})}/></label>
          <p className="workspace-secondary">Confirm the final choices independently. They may differ from the proposed stack.</p>
          <label className="session-field">Technology rationale<Textarea id="ea-final-technology-rationale" aria-label="Final technology rationale" value={draft.technologyRationale}
            maxLength={4000} rows={3} onChange={(_,d)=>change({technologyRationale:d.value})}/></label>
          <h3 className="ea-final-step">2. Architecture assessment</h3><p className="workspace-secondary">Refine the review below or keep it unchanged. Use Preview review to read the formatted report.</p><label className="session-field">Final assessment text
            <Textarea id="ea-final-review-text" aria-label="Final assessment text" value={draft.reviewText} maxLength={20000} rows={14} resize="vertical"
              onChange={(_,d)=>change({reviewText:d.value})}/></label>
          <h3 className="ea-final-step">3. Human EA decision</h3>
          <label className="session-field">EA complexity<Select id="ea-final-complexity" aria-label="Human EA complexity" value={draft.complexity??''}
            onChange={(_,d)=>change({complexity:d.value as HumanFields['complexity'] || null})}>
            <option value="">Select complexity</option>{['Low','Medium','High'].map(x=><option key={x}>{x}</option>)}</Select></label>
          <p className="workspace-secondary">Human-selected solution complexity; separate from Security and Responsible AI risk.</p>
          <label className="session-field">EA decision<Select id="ea-final-decision" aria-label="Human EA decision" value={draft.decision??''}
            onChange={(_,d)=>change({decision:d.value as HumanFields['decision'] || null})}>
            <option value="">Select decision</option>{['Approved','Conditional approval','On hold','Rejected'].map(x=><option key={x}>{x}</option>)}</Select></label>
          <label className="session-field">Decision rationale<Textarea id="ea-final-decision-rationale" aria-label="Human EA decision rationale" value={draft.decisionRationale}
            maxLength={4000} rows={3} onChange={(_,d)=>change({decisionRationale:d.value})}/></label>
          <label className="session-field">Conditions and outstanding work<Textarea id="ea-final-conditions" aria-label="Human EA conditions" value={draft.conditions}
            maxLength={4000} rows={3} onChange={(_,d)=>change({conditions:d.value})}/></label>
          <h3 className="ea-final-step">4. Architecture diagram evidence</h3>
          <label className="session-field">Diagram requirement<Select id="ea-final-diagram-requirement" aria-label="Diagram requirement" value={draft.diagramRequirement??'Required'} onChange={(_,d)=>change({diagramRequirement:d.value as HumanFields['diagramRequirement'],diagramConfirmed:false,...(d.value!=='Required' ? {diagramId:null} : {})})}>
            <option>Required</option><option>Not applicable</option><option>Pending</option></Select></label>
          {(draft.diagramRequirement??'Required')==='Required' && <>
            <p>Selected diagram: <strong>{draft.diagramId ? (currentDiagram && currentDiagram.id===draft.diagramId ? currentDiagram.fileName : row.diagramFileName)||draft.diagramId : 'None selected'}</strong></p>
            <p className="workspace-secondary">Upload or choose a saved version in Architecture diagrams below.</p>
            <Checkbox id="ea-final-diagram-confirmed" label="I have reviewed this diagram and confirm it represents the assessed solution" checked={draft.diagramConfirmed??false} disabled={!draft.diagramId} onChange={(_,d)=>change({diagramConfirmed:!!d.checked})}/>
          </>}
          {draft.diagramRequirement!=='Required' && draft.diagramRequirement && <label className="session-field">Diagram justification<Textarea id="ea-final-diagram-justification" aria-label="Diagram justification" value={draft.diagramJustification??''} maxLength={2000} onChange={(_,d)=>change({diagramJustification:d.value})}/></label>}
          {draft.diagramRequirement==='Pending' && <><p className="workspace-secondary">A pending diagram is permitted only for conditional approval. Record the diagram work in your conditions.</p>
            <label className="session-field">Diagram action owner<Input id="ea-final-diagram-owner" aria-label="Diagram action owner" value={draft.diagramOwner??''} maxLength={320} onChange={(_,d)=>change({diagramOwner:d.value})}/></label>
            <label className="session-field">Diagram due date<Input id="ea-final-diagram-due-date" aria-label="Diagram due date" type="date" value={draft.diagramDueDate??''} onChange={(_,d)=>change({diagramDueDate:d.value||null})}/></label></>}
        </fieldset>}
        <p className="workspace-secondary ea-final-diagram-note">Assessment diagram: {draft.diagramRequirement==='Required' ? (currentDiagram && currentDiagram.id===draft.diagramId ? currentDiagram.fileName : row.diagramFileName)||'None selected' : draft.diagramRequirement}.</p>
        <div className="ea-review-toolbar ea-final-actions">
          {row.status==='Draft' && <><Badge color={dirty ? 'warning' : 'informative'}>{dirty ? 'Unsaved changes' : 'Saved to database'}</Badge>
          <Button appearance="primary" disabled={!canEdit || !dirty || !draft.reviewText.trim()} onClick={save}>Save draft</Button>
          <Button appearance="primary" disabled={!canSubmit} onClick={()=>setDialog('submit')}>Submit final EA decision</Button></>}
          {row.status==='Submitted' && <Button appearance="primary" disabled={!canReopen} onClick={()=>setDialog('reopen')}>Reopen human review</Button>}
        </div>
        {row.status === 'Draft' && canEdit && (missing.length > 0 || dirty) && <section className="ea-final-submit-checklist" aria-label="Before submitting">
          <h4>Before submitting</h4>
          <ul>
            {missing.map(item => <li key={item.target}>
              <Button appearance="subtle" onClick={()=>guideTo(item.target)}>{item.label}</Button>
            </li>)}
            {dirty && <li>Save your draft after completing the fields.</li>}
          </ul>
        </section>}
        {row.status==='Submitted' && <p className="ea-final-help">This submitted version is read-only. Reopen it to create a new draft; the submitted record is retained.</p>}
        <details className="ea-final-provenance"><summary>AI source & human version details</summary><p>Source AI review ID: {row.sourceReviewId}</p>
          <p>Human review version {row.version} · Revision {row.revision}</p>{row.diagramId&&<p>Linked diagram ID: {row.diagramId}</p>}
          {state?.sourceReview?.id===row.sourceReviewId && state.sourceReview.text && <><h4>Original AI review used for this assessment (read-only)</h4><EAReviewReader text={state.sourceReview.text}/></>}
        </details>
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
            <p>Technology rationale: {s.review.technologyRationale}</p><p>Decision rationale: {s.review.decisionRationale}</p><p>Conditions: {s.review.conditions}</p><p>Diagram: {s.review.diagramFileName||s.review.diagramRequirement||'Not recorded'} · Human confirmed: {s.review.diagramConfirmed ? 'Yes' : 'No'}</p>{s.review.diagramJustification&&<p>{s.review.diagramJustification}</p>}{s.review.diagramOwner&&<p>Diagram owner: {s.review.diagramOwner} · Due: {s.review.diagramDueDate}</p>}
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
        {dialog==='submit'&&<p>Diagram evidence: {draft?.diagramRequirement??'Required'}{draft?.diagramConfirmed ? ' · Confirmed by human EA' : ''}{draft?.diagramJustification ? ` · ${draft.diagramJustification}` : ''}{draft?.diagramOwner ? ` · Owner: ${draft.diagramOwner} · Due: ${draft.diagramDueDate}` : ''}</p>}
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
