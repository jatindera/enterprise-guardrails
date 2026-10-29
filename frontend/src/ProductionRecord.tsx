import { useEffect, useRef, useState } from "react";
import { Badge, Button, Input, MessageBar, MessageBarBody, Select, Textarea } from "@fluentui/react-components";
import { useProjectUpdate } from "./ProjectUpdates";
import { getProductionDeployment, submitProductionDeployment, type ProductionDeploymentState } from "./api/projects";
import type { Project } from "./types";
import "./ProductionRecord.css";

type ProductionStatus = "Not deployed" | "In production";
type LeanIXStatus = "Not planned" | "Planned" | "Submitted";
interface Props { project: Project; active?: boolean; }
function isValidWebUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

export default function ProductionRecord({ project, active = true }: Props) {
  const updateProject = useProjectUpdate(project.demandId);
  const [result, setResult] = useState<ProductionDeploymentState | null>(null);
  const [productionStatus, setProductionStatus] = useState<ProductionStatus>("Not deployed");
  const [goLiveDate, setGoLiveDate] = useState("");
  const [comments, setComments] = useState("");
  const [baseRevision, setBaseRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const dirty = useRef(false);
  const sequence = useRef(0);
  const [leanixStatus, setLeanIXStatus] = useState<LeanIXStatus>(project.leanixStatus ?? "Not planned");
  const [leanixId, setLeanIXId] = useState(project.leanixId ?? "");
  const [leanixUrl, setLeanIXUrl] = useState(project.leanixUrl ?? "");
  const [leanixMessage, setLeanIXMessage] = useState("");
  const [leanixError, setLeanIXError] = useState("");
  const maxDate = new Date().toISOString().slice(0, 10);

  function resetDraft(value: ProductionDeploymentState) {
    setProductionStatus(value.productionStatus); setGoLiveDate(value.goLiveDate ?? "");
    setComments(value.comments); setBaseRevision(value.revision); dirty.current = false;
  }
  function accept(value: ProductionDeploymentState, force = false) {
    setResult(value);
    if (force || !dirty.current) resetDraft(value);
    updateProject({ productionStatus: value.productionStatus, goLiveDate: value.goLiveDate ?? undefined,
      productionComments: value.comments, productionSavedAt: value.savedAt ?? undefined,
      productionSavedBy: value.savedBy ?? undefined, productionRevision: value.revision, revision: value.projectRevision });
  }
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      if (busyRef.current || document.hidden) return;
      const current = ++sequence.current;
      try {
        const value = await getProductionDeployment(project.demandId, controller.signal);
        if (!cancelled && current === sequence.current) { acceptRef.current(value); setError(""); }
      } catch (cause) {
        if (!cancelled && current === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load production results.");
      }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [project.demandId, active]);

  function markChanged() { dirty.current = true; setError(""); setMessage(""); }
  async function submit() {
    if (!result?.canSubmit || busyRef.current) return;
    setError(""); setMessage("");
    if (productionStatus === "In production") {
      if (!result.canMarkInProduction) { setError(result.blocker ?? "Complete all three gate reviews with Approved, Conditional approval, or Not applicable."); return; }
      if (!goLiveDate) { setError("Enter the actual go-live date."); return; }
      if (goLiveDate > maxDate) { setError("The actual go-live date cannot be after today's UTC date."); return; }
    }
    busyRef.current = true; setBusy(true); ++sequence.current;
    try {
      const saved = await submitProductionDeployment(project.demandId, productionStatus,
        productionStatus === "In production" ? goLiveDate : null, comments.trim(), baseRevision);
      acceptRef.current(saved, true); setMessage("Production deployment results saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save production results.");
      try { acceptRef.current(await getProductionDeployment(project.demandId), true); } catch { setResult(null); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  function saveLeanIX() {
    if (!result?.canSubmit) return;
    setLeanIXError(""); setLeanIXMessage("");
    if (leanixUrl.trim() && !isValidWebUrl(leanixUrl.trim())) { setLeanIXError("Enter a LeanIX URL starting with https:// or http://."); return; }
    if (leanixStatus === "Submitted" && result.productionStatus !== "In production") { setLeanIXError("Submit the saved production status as In production before recording a LeanIX submission."); return; }
    if (leanixStatus === "Submitted" && !leanixId.trim() && !leanixUrl.trim()) { setLeanIXError("Enter a LeanIX ID or link."); return; }
    updateProject({ leanixStatus, leanixId: leanixId.trim(), leanixUrl: leanixUrl.trim() });
    setLeanIXMessage("LeanIX details saved in this workspace only. LeanIX persistence/integration is not connected yet.");
  }
  const canEdit = result?.canSubmit === true && !busy;
  const blockedSelection = productionStatus === "In production" && !result?.canMarkInProduction;
  return <section className="production-record">
    <div className="session-heading"><div><h3 className="session-subheading">Go-Live and LeanIX</h3><p>{project.name} · Demand {project.demandId}</p></div>
      <Badge appearance="tint" color={result?.productionStatus === "In production" ? "success" : "informative"}>{result?.productionStatus ?? "Loading"}</Badge></div>
    <MessageBar intent="info"><MessageBarBody>Submit records deployment results in the database; it does not deploy the application.</MessageBarBody></MessageBar>
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {message && <MessageBar intent="success"><MessageBarBody>{message}</MessageBarBody></MessageBar>}
    <section className="production-record-panel">
      <h3 className="session-subheading">Production deployment</h3>
      {result?.blocker && <MessageBar intent="warning"><MessageBarBody>{result.blocker}</MessageBarBody></MessageBar>}
      {result && !result.canSubmit && <p className="workspace-secondary">Read-only. Only the assigned primary EA, Security, RAI reviewer or Admin can submit.</p>}
      <div className="production-submit-row">
        <label className="session-field">Production status
          <Select value={productionStatus} disabled={!canEdit} onChange={(_, data) => {
            if (data.value === "In production" && !result?.canMarkInProduction) { setError(result?.blocker ?? "Complete all three gate reviews with Approved, Conditional approval, or Not applicable."); return; }
            setProductionStatus(data.value as ProductionStatus); markChanged();
          }}>
            <option value="Not deployed">Not deployed</option>
            <option value="In production" disabled={!result?.canMarkInProduction}>In production</option>
          </Select>
        </label>
        <Button appearance="primary" disabled={!canEdit || productionStatus !== "In production" || blockedSelection} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit"}</Button>
      </div>
      {productionStatus === "In production" && <label className="session-field">Actual go-live date (UTC)
        <Input type="date" value={goLiveDate} max={maxDate} disabled={!canEdit} onChange={(_, data) => { setGoLiveDate(data.value); markChanged(); }} />
      </label>}
      <label className="session-field">Deployment comments
        <Textarea value={comments} rows={3} maxLength={4000} readOnly={!canEdit} onChange={(_, data) => { setComments(data.value); markChanged(); }} />
      </label>
      {result && result.revision !== baseRevision && dirty.current && <p className="session-error">Deployment results changed in another session. <Button onClick={() => resetDraft(result)}>Reload saved values</Button></p>}
      {result?.savedAt && <p className="workspace-secondary">Last submitted by {result.savedBy} · {new Date(result.savedAt).toLocaleString()}</p>}
    </section>
    {result && result.history.length > 0 && <details className="production-record-panel"><summary>Deployment history</summary>
      {result.history.map((item) => <article className="ea-record" key={item.id}><strong>{item.productionStatus} · Revision {item.revision}</strong>
        <p>{item.goLiveDate ? `Go-live: ${item.goLiveDate}` : "No go-live date"}</p><p>{item.comments}</p>
        <p className="workspace-secondary">{item.actorName} · {new Date(item.recordedAt).toLocaleString()}</p></article>)}
    </details>}
    <section className="production-record-panel production-record-panel--leanix">
      <h3 className="session-subheading">LeanIX registration</h3>
      <p className="workspace-secondary">Register selected production applications in LeanIX and record their reference here. This section remains local to the open workspace.</p>
      {leanixError && <MessageBar intent="error"><MessageBarBody>{leanixError}</MessageBarBody></MessageBar>}
      {leanixMessage && <MessageBar intent="success"><MessageBarBody>{leanixMessage}</MessageBarBody></MessageBar>}
      <label className="session-field">LeanIX status
        <Select value={leanixStatus} disabled={!canEdit} onChange={(_, data) => setLeanIXStatus(data.value as LeanIXStatus)}>
          <option value="Not planned">Not planned</option><option value="Planned">Planned</option><option value="Submitted">Submitted</option>
        </Select>
      </label>
      <label className="session-field">LeanIX ID — optional unless no link is provided<Input value={leanixId} disabled={!canEdit} onChange={(_, data) => setLeanIXId(data.value)} /></label>
      <label className="session-field">LeanIX link<Input type="url" value={leanixUrl} disabled={!canEdit} placeholder="https://..." onChange={(_, data) => setLeanIXUrl(data.value)} /></label>
      <Button appearance="primary" disabled={!canEdit} onClick={saveLeanIX}>Save LeanIX details</Button>
      {project.leanixStatus === "Submitted" && project.leanixUrl && isValidWebUrl(project.leanixUrl) &&
        <p><a href={project.leanixUrl} target="_blank" rel="noopener noreferrer">Open saved LeanIX record</a></p>}
    </section>
  </section>;
}
