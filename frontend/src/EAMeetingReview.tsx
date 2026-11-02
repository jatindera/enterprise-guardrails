import {useCallback, useEffect, useRef, useState} from "react";
import {Badge, Button, Textarea, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions} from "@fluentui/react-components";
import TranscriptUpload from "./TranscriptUpload";
import EAReviewProposal from "./EAReviewProposal";
import EAReviewReader from "./EAReviewReader";
import type {TranscriptAttachment} from "./TranscriptUpload";
import type {AcceptedMeetingReview} from "./types";
import * as api from "./api/eaReviews";
import type {EAMeeting, EAMeetingIndex, EAReviewVersion, EAProposal} from "./api/eaReviews";
import "./EAMeetingReview.css";

interface Props { demandId: string; canEdit: boolean; beforeGenerate: () => Promise<void>;
  onAcceptedReviewChange: (review: AcceptedMeetingReview | null) => void }

export default function EAMeetingReview({demandId, canEdit, beforeGenerate, onAcceptedReviewChange}: Props) {
  const [index, setIndex] = useState<EAMeetingIndex | null>(null);
  const [meeting, setMeeting] = useState<EAMeeting | null>(null);
  const [selected, setSelected] = useState("");
  const [versionId, setVersionId] = useState("");
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<EAProposal>({technologies:[],rationale:""});
  const [local, setLocal] = useState<TranscriptAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState("Working…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{name:string;text:string} | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const reopenId = useRef<string | null>(null);
  const active = useRef(true);
  const currentDemand = useRef(demandId); currentDemand.current = demandId;
  const callback = useRef(onAcceptedReviewChange); callback.current = onAcceptedReviewChange;
  const revision = meeting?.reviews.find(r => r.id === versionId);
  const latest = meeting?.reviews.filter(r => r.status === "Draft" || r.status === "Accepted").at(-1);
  const textDirty = Boolean(revision && text !== (revision.text ?? ""));
  const proposalDirty = Boolean(meeting && (
    JSON.stringify(proposal.technologies) !== JSON.stringify(meeting.proposal?.technologies ?? []) ||
    proposal.rationale !== (meeting.proposal?.rationale ?? "")));
  const dirty = textDirty || proposalDirty;
  const generating = meeting?.reviews.some(r => r.status === "Generating") ?? false;
  const editable = canEdit && meeting?.canEdit && !busy && !generating;
  const latestSelected = Boolean(latest && revision?.id === latest.id);

  const loadIndex = useCallback(async (signal?: AbortSignal) => {
    const value = await api.getEAMeetings(demandId, signal);
    if (!active.current || signal?.aborted || currentDemand.current !== demandId) return value;
    setIndex(value);
    const accepted = value.latestAcceptedReview;
    callback.current(accepted?.text && accepted.acceptedAt ? {text: accepted.text, acceptedAt: accepted.acceptedAt} : null);
    return value;
  }, [demandId]);

  const loadMeeting = useCallback(async (id: string, signal?: AbortSignal) => {
    const value = await api.getEAMeeting(demandId, id, signal);
    if (!active.current || signal?.aborted || currentDemand.current !== demandId) return;
    setMeeting(value);
    setProposal(value.proposal ?? {technologies:[],rationale:""});
    const recent = value.reviews.filter(r => r.text).at(-1);
    setVersionId(recent?.id ?? ""); setText(recent?.text ?? "");
    setPreview(null);
  }, [demandId]);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    setAcceptOpen(false); setIndex(null); setMeeting(null); setSelected(""); setLocal([]); setProposal({technologies:[],rationale:""}); setError(""); callback.current(null);
    void loadIndex(controller.signal).then(value => {
      if (!active.current || controller.signal.aborted) return;
      setSelected(value.meetings.at(-1)?.id ?? "");
    }).catch(e => {if (!controller.signal.aborted) setError(e.message);});
    return () => {active.current = false; controller.abort();};
  }, [loadIndex]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setMeeting(null); setLocal([]); setNotice("");
    void loadMeeting(selected, controller.signal).catch(e => {if (!controller.signal.aborted) setError(e.message);});
    return () => controller.abort();
  }, [selected, loadMeeting]);

  useEffect(() => {
    if (!generating || !selected) return;
    const controller = new AbortController();
    const timer = setInterval(() => {void loadMeeting(selected, controller.signal).catch(() => {});}, 3000);
    return () => {clearInterval(timer); controller.abort();};
  }, [generating, selected, loadMeeting]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (dirty || local.length) {event.preventDefault(); event.returnValue = "";}};
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, local.length]);

  async function run(action: () => Promise<void>, message = "Saving or loading meeting data…") {
    if (busy) return;
    setBusy(true); setOperation(message); setError(""); setNotice("");
    try {await action();} catch (e) {
      if (active.current && currentDemand.current === demandId) setError(e instanceof Error ? e.message : "Request failed. Refresh and try again.");
    } finally {if (active.current && currentDemand.current === demandId) setBusy(false);}
  }
  async function refresh() { await loadIndex(); if (selected) await loadMeeting(selected); }
  async function start() {
    const value = await api.createEAMeeting(demandId);
    if (!active.current || currentDemand.current !== demandId) return;
    await loadIndex(); setSelected(value.id); setMeeting(value); setProposal(value.proposal ?? {technologies:[],rationale:""});
  }
  async function upload() {
    if (!meeting) return;
    const id = meeting.id;
    for (const item of local) {
      await api.uploadEATranscript(demandId,id,item.id,item.fileName,item.file ?? new Blob([item.text], {type:"text/plain"}));
      if (!active.current || currentDemand.current !== demandId) return;
      setLocal(items => items.filter(f => f.id !== item.id));
    }
    await loadMeeting(id); setNotice("Transcripts saved to storage.");
  }
  async function saveProposal() {
    if (!meeting || !proposalDirty) return meeting;
    const saved=await api.saveEAProposal(demandId,meeting.id,meeting.revision,proposal);
    if (!active.current || currentDemand.current !== demandId) return null;
    setMeeting(saved);setProposal(saved.proposal ?? {technologies:[],rationale:""});
    setNotice("Proposed technology stack and rationale saved.");
    return saved;
  }
  async function generate() {
    if (!meeting) return;
    await beforeGenerate();
    const saved=await saveProposal();
    if (!saved) return;
    try { await api.generateEAReview(demandId, saved.id, crypto.randomUUID(), saved.revision); }
    finally { await refresh(); }
  }
  async function saveEdit() {
    if (!meeting || !revision) return;
    await api.editEAReview(demandId,meeting.id,crypto.randomUUID(),revision.id,text,meeting.revision);
    await refresh(); setNotice("A new review version was saved.");
  }
  async function accept() {
    if (!meeting || !revision) return;
    await api.acceptEAReview(demandId,meeting.id,revision.id,meeting.revision);
    setAcceptOpen(false);
    await refresh(); setNotice("Meeting review accepted. Assigned EA or Admin can reopen it when new information is available.");
  }
  async function reopen() {
    if (!meeting || !reopenReason.trim()) return;
    reopenId.current ??= crypto.randomUUID();
    await api.reopenEAReview(demandId,meeting.id,reopenId.current,meeting.revision,reopenReason.trim());
    await refresh();
    setReopenOpen(false); setReopenReason(""); reopenId.current=null;
    setNotice("Review reopened. Add transcripts here and regenerate; the accepted version remains in history.");
  }
  async function viewFile(id:string,name:string,download=false) {
    if (!meeting) return;
    const blob = await api.downloadEATranscript(demandId,meeting.id,id);
    if (!active.current || currentDemand.current !== demandId) return;
    if (download) {
      const url=URL.createObjectURL(blob); const link=document.createElement("a");
      link.href=url; link.download=name; document.body.appendChild(link);
      link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),30000);
      setNotice(`Download started: ${name}`);
    } else setPreview({name,text:await blob.text()});
  }
  function selectReview(row: EAReviewVersion) {setVersionId(row.id); setText(row.text ?? "");}

  return <section className="ea-persistent-review" aria-label="EA meeting review workspace">
    <div className="content-panel"><div className="panel-heading"><h2>Meeting review workspace</h2><Badge appearance="tint">Saved review history</Badge></div>
      <div className="workspace-panel-body">
        <p>Add transcripts from each stakeholder meeting to this workspace, then regenerate the review. Continue until the information is sufficient and you are ready to accept the summary.</p>
        <div className="ea-review-toolbar">
          {index && index.meetings.length > 1 ? <label>Review workspace <select aria-label="Review workspace" value={selected} disabled={busy || dirty || local.length > 0}
            onChange={e => setSelected(e.target.value)}>{index.meetings.map(m => <option key={m.id} value={m.id}>{m.id === index.meetings.at(-1)?.id ? "Current workspace" : m.title + " (historical)"} · {m.state}</option>)}</select></label> : !index?.meetings.length ? <span>No review workspace yet.</span> : null}
          {canEdit && index?.canEdit && !index.meetings.length &&
            <Button appearance="primary" disabled={busy || dirty || local.length > 0} onClick={() => void run(start)}>Start review</Button>}
          <Button disabled={busy || dirty || local.length > 0} onClick={() => void run(refresh)}>Refresh saved data</Button>
        </div>
        {(dirty || local.length > 0) && <p className="workspace-secondary">Save or discard your local changes before switching meetings or refreshing saved data.</p>}

      </div>
    </div>
    {meeting && <>
      <section className="content-panel"><div className="panel-heading"><h2>Meeting transcripts</h2><Badge color={meeting.state === "Accepted" ? "success" : "informative"}>{meeting.state}</Badge></div>
        <div className="workspace-panel-body">
          {meeting.transcripts.length === 0 && <p>No saved transcripts. Add one or more meeting transcripts to begin.</p>}
          <ul className="ea-review-files">{meeting.transcripts.map(file => <li key={file.id}><span><strong>{file.fileName}</strong> · {["Removed", "Cancelled", "Deleting"].includes(file.status) ? file.status + " — excluded from AI" : file.status} · {(file.sizeBytes/1024).toFixed(1)} KB</span>
            <div>{file.status === "Ready" && <><Button disabled={busy} onClick={() => void run(() => viewFile(file.id,file.fileName), "Loading transcript preview…")}>Preview</Button><Button disabled={busy} onClick={() => void run(() => viewFile(file.id,file.fileName,true), "Downloading transcript…")}>Download</Button></>}
              <Button disabled={!editable || dirty} onClick={() => void run(async () => {
                try { await api.removeEATranscript(demandId,meeting.id,file.id); }
                catch (error) { try { await refresh(); } catch { /* Keep the original deletion error. */ } throw error; }
                await refresh(); setNotice("Transcript deleted from storage and database. Regenerate any draft based on it.");
              }, "Deleting transcript…")}>{file.status === "Deleting" ? "Retry deletion" : file.status === "Pending" ? "Cancel pending upload" : "Delete file"}</Button></div></li>)}</ul>
          {meeting.isCurrent === false && <p className="workspace-secondary">Historical workspace — read-only. Continue in the current workspace.</p>}
          {meeting.state === "Accepted" && <p>This review is accepted and read-only. Reopen it to add transcripts or revise the draft.</p>}
          {canEdit && meeting.canReopen && <Button disabled={busy || dirty} onClick={() => {setReopenOpen(true);setReopenReason("");reopenId.current=null;}}>Reopen accepted review</Button>}
          {meeting.state === "Open" && <><TranscriptUpload staged attachments={local} onAttachmentChange={setLocal} disabled={!editable || dirty}/>
            <Button appearance="primary" disabled={!editable || dirty || !local.length} onClick={() => void run(upload, "Saving transcripts…")}>Save transcripts</Button></>}
        </div>
      </section>
      <EAReviewProposal key={`${demandId}:${meeting.id}`} disabled={!editable || textDirty}
        value={proposal} dirty={proposalDirty} onChange={setProposal} saveDisabled={textDirty}
        onDiscard={() => setProposal(meeting.proposal ?? {technologies:[],rationale:""})}
        onSave={() => void run(async()=>{await saveProposal();},"Saving proposal…")}/>
      <section className="content-panel"><div className="panel-heading"><h2>AI meeting review</h2><Badge>{revision?.status ?? "Not generated"}</Badge></div>
        <div className="workspace-panel-body">
          <p>New AI reviews use a standard seven-section template: project understanding, requirements and constraints, independent technology review, gaps and contradictions, follow-up questions, review readiness and evidence references. “Ready for human assessment” means sufficient information for architectural judgment, not completed testing or project approval. Reviewer edits are saved as new versions. Acceptance confirms the summary and does not approve the project.</p>
          <p className="workspace-secondary">Review context: minimal project intake, your saved proposed technology stack/rationale and all Ready transcripts listed in this workspace. Previous AI reviews and prepared questions are not sent. Attach all meeting transcripts you want included.</p>
          <div className="ea-review-toolbar"><Button appearance="primary" disabled={!editable || local.length > 0 || textDirty || !meeting.transcripts.some(f => f.status === "Ready") || meeting.transcripts.some(f => ["Pending", "Deleting"].includes(f.status))}
            onClick={() => void run(generate)}>{latest ? "Regenerate review" : "Review meeting with AI"}</Button>
            {meeting.reviews.filter(r => r.text).length > 0 && <label>Review version <select aria-label="Review version" value={versionId} disabled={busy || dirty}
              onChange={e => {const row=meeting.reviews.find(r => r.id === e.target.value); if (row) selectReview(row);}}>
                {meeting.reviews.filter(r => r.text).map(r => <option key={r.id} value={r.id}>Version {r.version} · {r.status}</option>)}</select></label>}
          </div>
          {revision?.text && <><EAReviewReader text={text}/><details className="ea-review-editor"><summary>Edit review text</summary><label className="session-field">Consolidated review<Textarea aria-label="Consolidated review" rows={18} resize="vertical" maxLength={16000}
            disabled={!editable || !latestSelected || revision.status !== "Draft" || proposalDirty} value={text} onChange={(_,data) => setText(data.value)}/></label></details>
            <div className="ea-review-toolbar"><Button disabled={!editable || !latestSelected || revision.status !== "Draft" || proposalDirty || !textDirty || !text.trim()} onClick={() => void run(saveEdit)}>Save review changes</Button>
              {dirty && <Button disabled={busy} onClick={() => setText(revision.text ?? "")}>Discard edits</Button>}
              <Button appearance="primary" disabled={!editable || !meeting.canAccept || !latestSelected || dirty || local.length > 0 || meeting.transcripts.some(f => ["Pending", "Deleting"].includes(f.status))}
                onClick={() => setAcceptOpen(true)}>Accept meeting review</Button></div>
            {revision.acceptedAt && <p>Accepted by {revision.acceptedBy} · {new Date(revision.acceptedAt).toLocaleString()}</p>}
            {revision.basisReviewId && <p className="workspace-secondary">Based on the previous accepted review. Select an earlier meeting to inspect its history.</p>}
          </>}
          {!!meeting.reopenHistory?.length && <details><summary>Reopen history</summary><ul>{meeting.reopenHistory.map(event => <li key={event.id}>
            {event.createdBy} · {new Date(event.createdAt).toLocaleString()} — {event.reason}
          </li>)}</ul></details>}
          {meeting.reviews.some(r => r.status === "Failed") && <p className="workspace-secondary">Previous failed attempts are retained in history. Correct the issue and generate a new version.</p>}
          {meeting.reviews.filter(r => r.canRecover).map(r => <Button key={r.id} disabled={busy || !canEdit} onClick={() => void run(async () => {await api.recoverEAReview(demandId,meeting.id,r.id); await refresh();})}>Recover interrupted review request</Button>)}
        </div>
      </section>
    </>}
    <Dialog open={acceptOpen} onOpenChange={(_,data) => {if (!busy) setAcceptOpen(data.open);}}>
      <DialogSurface><DialogBody><DialogTitle>Accept this meeting review?</DialogTitle>
        <DialogContent><p>Confirm that you have reviewed the summary, findings and source references.</p>
          <p>Acceptance locks this review workspace. The assigned EA or Admin can reopen it with a reason. This does not approve the project or replace the human EA’s final assessment.</p>
          {error && <p role="alert">{error}</p>}
        </DialogContent><DialogActions>
          <Button disabled={busy} onClick={() => setAcceptOpen(false)}>Cancel</Button>
          <Button appearance="primary" disabled={busy || !editable || !meeting?.canAccept || !latestSelected || dirty || local.length > 0 || meeting?.transcripts.some(f => ["Pending", "Deleting"].includes(f.status))}
            onClick={() => void run(accept,"Accepting meeting review…")}>Confirm acceptance</Button>
        </DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
    <Dialog open={reopenOpen} onOpenChange={(_,data) => {if (!busy) setReopenOpen(data.open);}}>
      <DialogSurface><DialogBody><DialogTitle>Reopen accepted review</DialogTitle>
        <DialogContent><p>The accepted version remains in history. Reopening creates a new draft in this workspace.</p>
          {error && <p role="alert">{error}</p>}
          <label className="session-field">Reason for reopening<Textarea aria-label="Reason for reopening" value={reopenReason} maxLength={1000}
            disabled={busy} onChange={(_,data) => {setReopenReason(data.value);reopenId.current=null;}}/></label>
        </DialogContent><DialogActions>
          <Button disabled={busy} onClick={() => setReopenOpen(false)}>Cancel</Button>
          <Button appearance="primary" disabled={busy || !reopenReason.trim()} onClick={() => void run(reopen,"Reopening review…")}>Reopen review</Button>
        </DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
    <Dialog open={preview !== null} onOpenChange={(_, data) => {if (!data.open) setPreview(null);}}>
      <DialogSurface><DialogBody>
        <DialogTitle>{preview?.name ?? "Transcript preview"}</DialogTitle>
        <DialogContent><pre className="intake-source-text ea-transcript-preview">{preview?.text}</pre></DialogContent>
        <DialogActions><Button appearance="primary" onClick={() => setPreview(null)}>Close preview</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
    {(error || busy || generating || notice) && <div className={`ea-review-feedback ea-review-feedback--${error ? "error" : busy || generating ? "progress" : "success"}`}
      role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-atomic="true">
      <strong>{error || (busy ? operation : generating ? "Generating AI review…" : notice)}</strong>
      {!busy && !generating && <Button appearance="subtle" aria-label="Dismiss notification" onClick={() => {setError("");setNotice("");}}>Dismiss</Button>}
    </div>}
  </section>;
}
