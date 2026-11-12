import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Select, Textarea } from "@fluentui/react-components";
import { request } from "./api/projects";
import "./EAFinalAssessment.css";
import "./EAMeetingReview.css";
import TranscriptUpload, { type TranscriptAttachment } from "./TranscriptUpload";

type Version<T> = {
  id: string;
  revision: number;
  kind: string;
  sourceRevision: number | null;
  createdAt: string;
  data: T;
};
type AIReview = {
  summary: string;
  templateVersion?: string;
  readiness?: string;
  readinessReason?: string;
  findings: { kind: string; text: string; transcript: number; line: number; excerpt: string }[];
  sources: { fileName: string }[];
};
type AIReviewVersion = Version<AIReview> & { version: number; status: "Draft" | "Accepted" };
type Human = {
  risk: string;
  decision: string;
  assessment: string;
  rationale: string;
  conditions: string;
  reportId: string | null;
};
type Report = Version<{ fileName: string; sizeBytes: number }>;
type ReviewState = {
  revision: number;
  canClose: boolean;
  ai: Version<AIReview> | null;
  aiVersions?: AIReviewVersion[];
  acceptedAI: (Version<AIReview> & { version?: number }) | null;
  humanAI?: (Version<AIReview> & { version?: number }) | null;
  human: Version<Human> | null;
  reports: Report[];
  transcripts: Report[];
  history: Version<Human>[];
};

const emptyHuman: Human = { risk: "", decision: "", assessment: "", rationale: "", conditions: "", reportId: null };
const decisions = ["Approved", "Conditional approval", "On hold", "Rejected"];

function AIReader({ review, downloadSource, busy }: { review: Version<AIReview>; downloadSource: (number: number, name: string) => void; busy: boolean }) {
  const sections = [
    ["Requirement", "2. Security requirements and constraints"],
    ["Reported control", "3. Reported controls"],
    ["Open risk", "4. Open risks and verification gaps"],
    ["Follow-up", "5. Follow-up questions and actions"],
  ];
  return <article className="ea-review-reader" aria-label="Read-only Security AI review">
    <p className="ea-review-legend">Red highlights open risks and verification gaps. Reported controls reflect stakeholder statements.</p>
    <h3>Consolidated Security meeting review</h3>
    <p>Review template {review.data.templateVersion ?? "1.0 (saved legacy review)"}</p>
    <h4>1. Project understanding</h4>
    <p className="security-preserve-text">{review.data.summary}</p>
    {sections.map(([kind, title]) => {
      const findings = review.data.findings.filter(finding => finding.kind === kind);
      return <section key={kind}>
        <h3>{title}</h3>
        {findings.length === 0 && <p>None recorded.</p>}
        {findings.map((finding, index) => <div key={index} className={kind === "Open risk" ? "ea-review-finding ea-review-finding--attention" : "ea-review-finding"}>
          <strong>{finding.kind}</strong>
          <p className="security-preserve-text">{finding.text}</p>
          <blockquote>{finding.excerpt}</blockquote>
          <small>{review.data.sources[finding.transcript - 1]?.fileName}, line {finding.line}</small>
        </div>)}
      </section>;
    })}
    <h4>6. Review readiness</h4>
    {review.data.readiness ? <><Badge appearance="tint">{review.data.readiness}</Badge>
      <p>{review.data.readinessReason}</p></> : <p>Readiness was not captured in this version.</p>}
    <p>Readiness is advisory. The Security reviewer records the final decision.</p>
    <h4>7. Evidence references</h4>
    {review.data.sources.map((source, index) => <Button appearance="primary" key={index} disabled={busy}
      onClick={() => downloadSource(index + 1, source.fileName)}>Download source {source.fileName}</Button>)}
  </article>;
}

export default function SecurityReviews({ demandId, canEdit, mode, beforeGenerate, openReview }:{
  demandId: string;
  canEdit: boolean;
  mode: "ai" | "human";
  beforeGenerate?: () => Promise<void>;
  openReview?: () => void;
}) {
  const base = `/api/projects/${encodeURIComponent(demandId)}/security-reviews`;
  const [reviewRevision, setReviewRevision] = useState<number | null>(null);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [state, setState] = useState<ReviewState | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptAttachment[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Human>(emptyHuman);
  const [reason, setReason] = useState("");
  const [operation, setOperation] = useState("");
  const busy = Boolean(operation);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const reportInput = useRef<HTMLInputElement>(null);
  const reportAttempt = useRef<{ file: File; id: string } | null>(null);

  const load = useCallback(async (signal: AbortSignal, hydrate = true) => {
    const value = await request<ReviewState>(base, { signal });
    if (signal.aborted) return;
    setState(value);
    if (hydrate) {
      const saved = value.human?.data ?? emptyHuman;
      setDraft({ risk: saved.risk, decision: saved.decision, rationale: saved.rationale,
        assessment: saved.assessment ?? (value.human ? "" : value.acceptedAI?.data.summary ?? ""),
        conditions: saved.conditions, reportId: saved.reportId });
    }
  }, [base]);

  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    void load(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, [canEdit, load]);

  async function run(action: (signal: AbortSignal) => Promise<void>, message = "Working on the Security review…") {
    if (!canEdit || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setOperation(message);
    setError("");
    try {
      await action(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Security review request failed.");
    } finally {
      if (active.current === controller) {
        active.current = null;
        setOperation("");
      }
    }
  }

  function mutate(path: string, body: object, method = "POST") {
    if (!state) return;
    void run(async signal => {
      if (path === "/generate") await beforeGenerate?.();
      await request(base + path, { method, signal, body: JSON.stringify({
        expectedRevision: state.revision, ...body,
      }) }, "json", 240000);
      await load(signal);
      if (signal.aborted) return;
      if (path === "/generate") setReviewRevision(null);
      if (path === "/human" || path === "/human/submit") setEditing(false);
      if (path === "/human/reopen") {
        setReason("");
        setEditing(true);
      }
    });
  }

  function saveTranscripts() {
    void run(async signal => {
      try {
        for (const item of transcripts) {
          await request(`${base}/transcripts/${item.id}?fileName=${encodeURIComponent(item.fileName)}`,
            { method: "PUT", signal, body: item.file ?? item.text,
              headers: { "Content-Type": "application/octet-stream" } }, "json", 120000);
          if (signal.aborted) return;
          setTranscripts(current => current.filter(file => file.id !== item.id));
        }
      } catch (err) {
        if (!signal.aborted) await load(signal, false).catch(() => {});
        throw err;
      }
      await load(signal, false);
    }, "Saving transcripts…");
  }

  function uploadReport(file: File) {
    if (!reportAttempt.current || reportAttempt.current.file !== file) {
      reportAttempt.current = { file, id: crypto.randomUUID() };
    }
    const { id } = reportAttempt.current;
    void run(async signal => {
      const report = await request<Report>(
        `${base}/reports/${id}?fileName=${encodeURIComponent(file.name)}`,
        { method: "PUT", signal, body: file, headers: { "Content-Type": "application/pdf" } },
        "json", 120000,
      );
      await load(signal, false);
      if (!signal.aborted) {
        setDraft(current => ({ ...current, reportId: report.id }));
        setEditing(true);
        reportAttempt.current = null;
      }
    });
  }

  function download(path: string, fileName: string, message = "Downloading file…") {
    void run(async signal => {
      const data = await request<Blob>(base + path, { signal }, "blob");
      if (signal.aborted) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, message);
  }

  function previewTranscript(file: Report) {
    void run(async signal => {
      const blob = await request<Blob>(`${base}/transcripts/${file.id}/download`, { signal }, "blob");
      const text = await blob.text();
      if (!signal.aborted) setPreview({ name: file.data.fileName, text });
    }, "Loading transcript preview…");
  }

  function deleteTranscript(file: Report) {
    setPendingDelete(null);
    void run(async signal => {
      try {
        await request(`${base}/transcripts/${file.id}`, { method: "DELETE", signal });
      } catch (err) {
        if (!signal.aborted) await load(signal, false).catch(() => {});
        throw err;
      }
      await load(signal, false);
    }, "Deleting transcript…");
  }

  function reader(review: Version<AIReview>) {
    return <AIReader review={review} busy={busy} downloadSource={(number, name) =>
      download(`/ai/${review.revision}/transcripts/${number}/download`, name)} />;
  }

  const reviewVersions = state?.aiVersions ?? (state?.ai ? [{
    ...state.ai, version: 1, status: state.acceptedAI?.revision === state.ai.revision ? "Accepted" as const : "Draft" as const,
  }] : []);
  const visibleReview = reviewVersions.find(item => item.revision === reviewRevision) ?? reviewVersions[reviewVersions.length - 1];
  const submitted = state?.human?.kind === "Submitted";
  const source = submitted ? state?.humanAI ?? state?.acceptedAI : state?.acceptedAI;
  const saved = state?.human?.data;
  const draftMatches = saved && (Object.keys(emptyHuman) as (keyof Human)[]).every(key => draft[key] === (key === "assessment" ? saved.assessment ?? "" : saved[key]));
  const currentSource = state?.human?.sourceRevision === state?.acceptedAI?.revision;
  const selected = (state?.transcripts ?? []).filter(file => file.kind === "Transcript" && !excluded.includes(file.id));
  const canSubmit = !busy && state?.canClose && draftMatches && currentSource &&
    draft.risk && draft.decision && draft.rationale.trim() &&
    (draft.decision !== "Conditional approval" || draft.conditions.trim());

  return <section className={mode === "human" ? "content-panel ea-final-assessment" : "content-panel"}>
    <div className={mode === "human" ? "panel-heading ea-final-heading" : "panel-heading"}>
      <div>{mode === "human" && <span className="ea-final-eyebrow">Enterprise security</span>}
        <h2>{mode === "ai" ? "Security AI review" : "Human Security final review"}</h2>
        {mode === "human" && <p>Your assessment, decision and supporting evidence.</p>}
      </div>
      {mode === "human" && state?.human && <Badge appearance="tint" color={submitted ? "success" : "informative"}>
        {state.human.kind} · Version {state.human.revision}
      </Badge>}
    </div>
    <div className="workspace-panel-body">
      {!canEdit && <p>Security review access is limited to assigned Security reviewers and Admins.</p>}
      {canEdit && <>
        {error && <p role="alert">{error}</p>}
        <div className="ea-final-utility">
          <Button appearance="primary" disabled={busy || editing} onClick={() => void run(signal => load(signal))}>Reload saved Security review</Button>
          {mode === "human" && state?.acceptedAI && openReview && <Button appearance="primary" disabled={busy || editing} onClick={openReview}>Open review meeting</Button>}
        </div>
        {busy && <div role="status" className="ea-review-feedback ea-review-feedback--progress"><strong>{operation}</strong></div>}
        {mode === "ai" && state && <>
          <section className="content-panel" aria-label="Meeting transcripts">
            <div className="panel-heading"><h2>Meeting transcripts</h2></div>
            <div className="workspace-panel-body">
              {state.transcripts.length === 0 ? <p>No saved transcripts. Add one or more meeting transcripts to begin.</p> :
                <ul className="ea-review-files">
                  {state.transcripts.map(file => {
                    const ready = file.kind === "Transcript";
                    return <li key={file.id}>
                      <label>
                        <input type="checkbox" checked={ready && !excluded.includes(file.id)} disabled={busy || !ready}
                          aria-label={`Include ${file.data.fileName} in review`}
                          onChange={event => {
                            const checked = event.currentTarget.checked;
                            setExcluded(current => checked ? current.filter(id => id !== file.id) : [...current, file.id]);
                          }} />
                        {" "}<strong>{file.data.fileName}</strong> · {ready ? "Ready" : "Deletion pending"} · {(file.data.sizeBytes / 1024).toFixed(1)} KB
                      </label>
                      <div>
                        {ready && <>
                          <Button appearance="primary" disabled={busy} onClick={() => previewTranscript(file)}>Preview</Button>
                          <Button appearance="primary" disabled={busy} onClick={() =>
                            download(`/transcripts/${file.id}/download`, file.data.fileName, "Downloading transcript…")}>Download</Button>
                        </>}
                        <Button appearance="primary" disabled={busy} onClick={() => setPendingDelete(file)}>
                          {ready ? "Delete file" : "Retry deletion"}
                        </Button>
                      </div>
                    </li>;
                  })}
                </ul>}
              <TranscriptUpload staged attachments={transcripts} onAttachmentChange={setTranscripts} disabled={busy} />
              <Button appearance="primary" disabled={busy || transcripts.length === 0} onClick={saveTranscripts}>Save transcripts</Button>
            </div>
          </section>
          <Dialog open={preview !== null} onOpenChange={(_, data) => { if (!data.open) setPreview(null); }}>
            <DialogSurface><DialogBody>
              <DialogTitle>{preview?.name ?? "Transcript preview"}</DialogTitle>
              <DialogContent><pre className="intake-source-text ea-transcript-preview">{preview?.text}</pre></DialogContent>
              <DialogActions><Button appearance="primary" onClick={() => setPreview(null)}>Close preview</Button></DialogActions>
            </DialogBody></DialogSurface>
          </Dialog>
          <Dialog open={pendingDelete !== null} onOpenChange={(_, data) => { if (!data.open) setPendingDelete(null); }}>
            <DialogSurface><DialogBody>
              <DialogTitle>Delete saved transcript?</DialogTitle>
              <DialogContent>{pendingDelete?.data.fileName} will be removed from this Security review workspace and storage.</DialogContent>
              <DialogActions>
                <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
                <Button appearance="primary" onClick={() => { if (pendingDelete) deleteTranscript(pendingDelete); }}>Delete transcript</Button>
              </DialogActions>
            </DialogBody></DialogSurface>
          </Dialog>
          <section className="content-panel" aria-label="AI meeting review">
            <div className="panel-heading">
              <h2>AI meeting review</h2>
              <Badge appearance="filled" color={visibleReview?.status === "Accepted" ? "success" : "brand"}>
                {visibleReview?.status ?? "Not generated"}
              </Badge>
            </div>
            <div className="workspace-panel-body">
              <p>The standard Security template uses project intake and the selected saved transcripts. Review readiness is advisory.</p>
              <div className="ea-review-toolbar">
                <Button appearance="primary" disabled={busy || transcripts.length > 0 || selected.length === 0 || selected.length > 10}
                  onClick={() => mutate("/generate", { transcriptIds: selected.map(file => file.id) })}>
                  {state.ai ? "Regenerate review" : "Generate Security AI review"}
                </Button>
                {visibleReview && <label>Review version
                  <select value={visibleReview.revision} disabled={busy}
                    onChange={event => setReviewRevision(Number(event.currentTarget.value))}>
                    {reviewVersions.map(item => <option key={item.id} value={item.revision}>
                      Version {item.version} · {item.status}
                    </option>)}
                  </select>
                </label>}
              </div>
              {selected.length > 10 && <p>Select up to 10 saved transcripts for this review.</p>}
              {visibleReview && <>
                {reader(visibleReview)}
                <p className="workspace-secondary">AI-generated review · Read-only. Record your final Security decision in Security assessment.</p>
                {visibleReview.status === "Draft" && <Button appearance="primary"
                  disabled={busy || transcripts.length > 0 || visibleReview.revision !== state.ai?.revision}
                  onClick={() => setConfirmAccept(true)}>Accept meeting review</Button>}
              </>}
            </div>
          </section>
          <Dialog open={confirmAccept} onOpenChange={(_, data) => { if (!data.open) setConfirmAccept(false); }}>
            <DialogSurface><DialogBody>
              <DialogTitle>Accept Security meeting review?</DialogTitle>
              <DialogContent>Version {visibleReview?.version} will become the source for human Security assessment.</DialogContent>
              <DialogActions>
                <Button onClick={() => setConfirmAccept(false)}>Cancel</Button>
                <Button appearance="primary" onClick={() => {
                  setConfirmAccept(false);
                  if (visibleReview) mutate("/accept", { reviewRevision: visibleReview.revision });
                }}>Accept review</Button>
              </DialogActions>
            </DialogBody></DialogSurface>
          </Dialog>
        </>}
        {mode === "human" && state && <>
          <p>Record the human Security decision and attach the team’s closing report when available. The existing Security system remains the official record.</p>
          {!state.acceptedAI && <p>Accept a Security AI review before saving the human assessment.{" "}
            <Button appearance="primary" onClick={openReview}>Open review meeting</Button></p>}
          {source && <details className="ea-final-source"><summary>AI review source · Version {source.version ?? source.revision} <span className="ea-final-source-hint">Read-only reference</span></summary>
            {reader(source)}</details>}
          {state.human && !submitted && !currentSource && <p role="status">The accepted AI source changed. Review it before saving a new draft.</p>}
          {submitted ? <p role="status">Security decision submitted.</p> :
            <p>To submit, save the risk classification, decision and rationale. Conditional approval also requires conditions.</p>}
          {state.acceptedAI && <section className="ea-final-draft">
            <h3>{submitted ? "Submitted human final review" : "Human Security review draft"}</h3>
            <div className="ea-final-summary">
              <div><span>Security decision</span><strong>{draft.decision || "Not selected"}</strong></div>
              <div><span>Security risk</span><strong>{draft.risk || "Not selected"}</strong></div>
              <div><span>{submitted ? "Submitted on" : "Last saved"}</span><strong>
                {state.human ? new Date(state.human.createdAt).toLocaleString() : "Unsaved"}</strong></div>
            </div>
            {!submitted && !editing && <div className="ea-final-mode">
              <Button appearance="primary" disabled={busy} onClick={() => setEditing(true)}>Edit human review</Button>
              <Button appearance="primary" disabled={!canSubmit} onClick={() => mutate("/human/submit", draft)}>Submit Security decision</Button>
            </div>}
            {!editing && <section className="ea-final-report">
              <section><h3>Security assessment</h3><p className="security-preserve-text">{draft.assessment || "Not recorded"}</p></section>
              <section><h3>Decision rationale</h3><p className="security-preserve-text">{draft.rationale || "Not recorded"}</p></section>
              <section><h3>Conditions and outstanding work</h3><p className="security-preserve-text">{draft.conditions || "None recorded"}</p></section>
              <section><h3>Closing report</h3><p>{state.reports.find(report => report.id === draft.reportId)?.data.fileName ?? "None selected"}</p></section>
            </section>}
          </section>}
          {editing && !submitted && state.acceptedAI && <fieldset className="ea-final-fields" disabled={busy}>
            <legend>Reviewer decision</legend>
            <label className="session-field">Final Security assessment text
              <Textarea rows={8} resize="vertical" value={draft.assessment} maxLength={16000} onChange={(_, data) => setDraft({ ...draft, assessment: data.value })} />
            </label>
            <label className="session-field">Security risk classification
              <Select value={draft.risk} onChange={(_, data) => setDraft({ ...draft, risk: data.value })}>
                <option value="">Select risk</option>
                {["Low", "Medium", "High"].map(value => <option key={value}>{value}</option>)}
              </Select>
            </label>
            <label className="session-field">Security decision
              <Select value={draft.decision} onChange={(_, data) => setDraft({ ...draft, decision: data.value })}>
                <option value="">Select decision</option>
                {decisions.map(value => <option key={value}>{value}</option>)}
              </Select>
            </label>
            <label className="session-field">Decision rationale
              <Textarea value={draft.rationale} maxLength={6000} onChange={(_, data) => setDraft({ ...draft, rationale: data.value })} />
            </label>
            <label className="session-field">Security conditions
              <Textarea value={draft.conditions} maxLength={6000} onChange={(_, data) => setDraft({ ...draft, conditions: data.value })} />
            </label>
            <label className="session-field">Closing report for this decision
              <Select value={draft.reportId ?? ""} onChange={(_, data) => setDraft({ ...draft, reportId: data.value || null })}>
                <option value="">No closing report selected</option>
                {state.reports.map(report => <option key={report.id} value={report.id}>{report.data.fileName} · v{report.revision}</option>)}
              </Select>
            </label>
            <div className="ea-final-actions ea-review-toolbar">
              <Button appearance="primary" onClick={() => mutate("/human", draft, "PUT")}>Save Security draft</Button>
              <Button appearance="primary" onClick={() => void run(async signal => {
                await load(signal);
                if (!signal.aborted) setEditing(false);
              })}>Discard unsaved changes</Button>
            </div>
          </fieldset>}
          {submitted && state.canClose && <>
            <label className="session-field">Reason to reopen
              <Textarea value={reason} disabled={busy} maxLength={1000} onChange={(_, data) => setReason(data.value)} />
            </label>
            <Button appearance="primary" disabled={busy || !reason.trim()} onClick={() => mutate("/human/reopen", { reason })}>Reopen Security review</Button>
          </>}
          <h3>Closing reports</h3>
          <input type="file" accept=".pdf" hidden ref={reportInput} disabled={busy} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) uploadReport(file);
          }} />
          <Button appearance="primary" disabled={busy || submitted} onClick={() => reportInput.current?.click()}>Upload Security closing report</Button>
          {state.reports.map(report => <p key={report.id}><Button appearance="primary" disabled={busy} onClick={() => download(`/reports/${report.id}/download`, report.data.fileName)}>
            Download {report.data.fileName} · v{report.revision}
          </Button></p>)}
          {reportAttempt.current && error && <Button appearance="primary" disabled={busy} onClick={() => {
            const attempt = reportAttempt.current;
            if (attempt) uploadReport(attempt.file);
          }}>Retry report upload</Button>}
          <h3>Submitted Security decisions</h3>
          {state.history.map(item => <details key={item.id}>
            <summary>v{item.revision} · {item.data.decision} · {new Date(item.createdAt).toLocaleString()}</summary>
            <p>Risk: {item.data.risk} · AI source v{item.sourceRevision}</p>
            {item.data.assessment && <p className="security-preserve-text">{item.data.assessment}</p>}
            <p className="security-preserve-text">{item.data.rationale}</p>
            {item.data.conditions && <p className="security-preserve-text">{item.data.conditions}</p>}
            {item.data.reportId && <p>Closing report: {state.reports.find(report => report.id === item.data.reportId)?.data.fileName}</p>}
          </details>)}
        </>}
      </>}
    </div>
  </section>;
}
