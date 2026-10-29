import { useEffect, useRef, useState } from "react";
import { Badge, Button, Checkbox, MessageBar, MessageBarBody, Select, Textarea } from "@fluentui/react-components";
import { reviewSignature } from "./projectWorkflow";
import { useProjectUpdate } from "./ProjectUpdates";
import { changeGateApplicability, getPreProductionGate, saveGateDecision, type GateState } from "./api/projects";
import GateAttachments from "./GateAttachments";
import type { GateDomainReview, GateReviewDecision, GateReviewDomain, Project } from "./types";
import "./ProductionGate.css";

interface ProductionGateProps {
  project: Project;
  active?: boolean;
}
const decisions: GateReviewDecision[] = ["Approved", "Conditional approval", "On hold", "Rejected", "Not applicable"];

interface ReviewerCardProps {
  domain: GateReviewDomain;
  reviewer: string;
  enabled: boolean;
  required: boolean;
  saved?: GateDomainReview;
  current: boolean;
  busy: boolean;
  onSave: (decision: GateReviewDecision, comments: string) => void;
}
function ReviewerCard({ domain, reviewer, enabled, required, saved, current, busy, onSave }: ReviewerCardProps) {
  const [editing, setEditing] = useState(!saved);
  const [decision, setDecision] = useState<GateReviewDecision | "">(saved?.decision ?? "");
  const [comments, setComments] = useState(saved?.comments ?? "");
  useEffect(() => {
    setEditing(!saved);
    setDecision(saved?.decision ?? "");
    setComments(saved?.comments ?? "");
  }, [reviewer, saved?.recordedAt]);
  const canEdit = enabled && required && !busy && editing;
  const changed = decision !== (saved?.decision ?? "") || comments !== (saved?.comments ?? "");
  return (
    <section className="gate-reviewer-card" aria-label={`${domain} gate review`}>
      <div className="session-heading">
        <h3>{domain} review</h3>
        <Badge appearance="tint" color={saved && current ? "success" : "informative"}>
          {saved ? (current ? saved.decision : "Needs reconfirmation") : "Not recorded"}
        </Badge>
      </div>
      <p className="gate-reviewer-name"><span>Assigned reviewer</span><strong>{reviewer || "Not assigned"}</strong></p>
      {!canEdit && <p className="workspace-secondary">{required ? "Read-only. The assigned primary reviewer or Admin records this decision." : "Disabled — this gate is not required in the intake."}</p>}
      <label className="session-field">
        {domain} decision
        <Select value={decision} disabled={!canEdit} onChange={(_, data) => setDecision(data.value as GateReviewDecision | "")}>
          <option value="">Select a decision</option>
          {decisions.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </label>
      <label className="session-field">
        {domain} review comments
        <Textarea value={comments} rows={4} readOnly={!canEdit} disabled={!required}
          placeholder="Record what you verified, your rationale, and any conditions with owners and due dates."
          onChange={(_, data) => setComments(data.value)} />
      </label>
      {enabled && required && saved && !editing && <Button disabled={busy} onClick={() => setEditing(true)}>Edit decision</Button>}
      {canEdit && <Button appearance="primary" disabled={!decision || !comments.trim() || (!changed && current)}
        onClick={() => { if (decision) onSave(decision, comments.trim()); }}>
        Record {domain} decision
      </Button>}
      {canEdit && saved && <Button onClick={() => { setDecision(saved.decision); setComments(saved.comments); setEditing(false); }}>Cancel edit</Button>}
      {saved && <p className="workspace-secondary">Recorded {new Date(saved.recordedAt).toLocaleString()}</p>}
    </section>
  );
}

export default function ProductionGate({ project, active = true }: ProductionGateProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const [state, setState] = useState<GateState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sequence = useRef(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const projectRef = useRef(project);
  projectRef.current = project;

  function accept(result: GateState) {
    setState(result);
    const decision = decisions.find((item) => item === result.combinedStatus);
    const latestAt = result.history[0]?.recordedAt;
    updateProject({ gateRequired: result.required, revision: result.projectRevision,
      gateDecision: result.required ? decision : undefined,
      gateRecordedAt: result.required && decision ? latestAt : undefined,
      gateReviewSignature: result.required && decision
        ? (projectRef.current.gateRecordedAt === latestAt && projectRef.current.gateReviewSignature
          ? projectRef.current.gateReviewSignature : reviewSignature(projectRef.current))
        : undefined });
  }
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      if (busyRef.current || document.hidden) return;
      const requestSequence = ++sequence.current;
      try {
        const result = await getPreProductionGate(project.demandId, controller.signal);
        if (!cancelled && requestSequence === sequence.current) { acceptRef.current(result); setError(""); }
      } catch (cause) {
        if (!cancelled && requestSequence === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load gate.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [project.demandId, active, project.gateRequired]);

  async function mutate(action: () => Promise<GateState>, success: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); ++sequence.current; setError(""); setMessage("");
    try { acceptRef.current(await action()); setMessage(success); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save gate.");
      try { acceptRef.current(await getPreProductionGate(project.demandId)); } catch { setState(null); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  const required = state?.required === true;
  const canUpload = required && !busy && state?.reviewers.some((reviewer) => reviewer.canEdit);
  return (
    <section className="production-gate">
      <div className="session-heading">
        <div><h3 className="session-subheading">Pre-Production Gate</h3><p>{project.name} · Demand {project.demandId}</p></div>
        <Badge appearance="tint" color={state?.combinedStatus === "Approved" ? "success" : "informative"}>{state?.combinedStatus ?? "Loading"}</Badge>
      </div>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {message && <MessageBar intent="success"><MessageBarBody>{message}</MessageBarBody></MessageBar>}
      <section className="workspace-content-panel gate-section">
        <Checkbox label="Pre-Production Gate is not applicable to this project" checked={state ? !state.required : project.gateRequired !== true}
          disabled={!state?.canChangeApplicability || busy}
          onChange={(_, data) => { if (state?.canChangeApplicability) void mutate(
            () => changeGateApplicability(project.demandId, data.checked !== true, state.projectRevision),
            "Gate applicability saved. The next intake import will apply its latest value."); }} />
        <p className="workspace-secondary">Only Admin can change applicability. Intake Yes requires this gate; No or blank means not required.</p>
      </section>
      {state && required && <>
        <MessageBar intent="info"><MessageBarBody>Each primary reviewer records their own decision. Saved decisions are locked until Edit decision is selected. Attachments are optional and shared by all reviewers.</MessageBarBody></MessageBar>
        <section className="workspace-content-panel gate-section">
          <div className="session-heading"><h3 className="session-subheading">Reviewer decisions</h3></div>
          <div className="gate-reviewer-grid">
            {state.reviewers.map((reviewer) => <ReviewerCard key={reviewer.domain} domain={reviewer.domain} reviewer={reviewer.reviewer}
              enabled={reviewer.canEdit} required={required} busy={busy} current={reviewer.current}
              saved={reviewer.saved ? { decision: reviewer.saved.decision, comments: reviewer.saved.comments,
                reviewer: reviewer.saved.reviewerName, recordedAt: reviewer.saved.recordedAt, reviewSignature: "", evidenceFileNames: [] } : undefined}
              onSave={(decision, comments) => { if (reviewer.canEdit && !busy) void mutate(
                () => saveGateDecision(project.demandId, reviewer.domain, decision, comments, reviewer.revision), `${reviewer.domain} decision saved.`); }} />)}
          </div>
          <p className="workspace-secondary">Not applicable counts as Approved. Any Conditional approval makes the completed overall review Conditional approval. Rejected or On hold blocks go-live; all three current reviewer decisions must be recorded.</p>
        </section>
        <GateAttachments key={project.demandId} demandId={project.demandId} active={active} canUpload={Boolean(canUpload)} />
        {state.history.length > 0 && <details className="workspace-content-panel gate-section"><summary>Decision history</summary>
          {state.history.map((record) => <article className="ea-record" key={record.id}>
            <strong>{record.domain} · {record.decision} · Revision {record.revision}</strong>
            <p>{record.comments}</p><p className="workspace-secondary">Reviewer: {record.reviewerName} · Recorded by: {record.actorName} · {new Date(record.recordedAt).toLocaleString()}</p>
          </article>)}
        </details>}
      </>}
    </section>
  );
}
