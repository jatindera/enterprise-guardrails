import { useState } from "react";
import { Button, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { useAuth } from "./auth/AuthGate";
import { resolvePrimaryRAI, saveAdditionalRAI } from "./api/projects";
import type { RAIAccess } from "./api/projects";
import type { Project } from "./types";

interface Props {
  project: Project;
  access: RAIAccess | null;
  onUpdated: (value: RAIAccess) => void;
  error: string;
  onRetry: () => void;
}

export default function RAIAccessPanel({ project, access, onUpdated, error: loadError, onRetry }: Props) {
  const isAdmin = useAuth().roles.includes("Admin");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentRevision = access?.revision ?? 0;

  async function run(action: () => Promise<RAIAccess>) {
    setBusy(true); setError("");
    try { const result = await action(); onUpdated(result); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the assignment."); }
    finally { setBusy(false); }
  }
  return <section className="content-panel" style={{ marginBottom: 16 }}>
    <div className="workspace-panel-body">
      <strong>RAI reviewers</strong>
      <p>Assigned reviewer: {project.assignedRAI}</p>
      <p>Additional reviewer: {access?.additionalEmail || "None"}</p>
      {!access && !loadError && <p>Checking RAI access…</p>}
      {loadError && <MessageBar intent="error"><MessageBarBody>{loadError} <Button onClick={onRetry}>Retry</Button></MessageBarBody></MessageBar>}
      {access && !access.primaryResolved && <p>Primary reviewer identity is not resolved.</p>}
      {access && !access.canEdit && <p>RAI assessment is read-only for your account.</p>}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {isAdmin && access && !access.primaryResolved && <Button disabled={busy} onClick={() => void run(() => resolvePrimaryRAI(project.demandId, currentRevision))}>Resolve assigned reviewer</Button>}
      {access?.canManageAdditional && !editing && <Button disabled={busy} onClick={() => { setEmail(access.additionalEmail || ""); setEditing(true); }}>Edit additional reviewer</Button>}
      {access?.canManageAdditional && editing && <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <label className="session-field">Additional reviewer sign-in email (optional)
          <Input value={email} type="email" maxLength={320} disabled={busy} onChange={(_, data) => setEmail(data.value)} />
        </label>
        <div className="meeting-review-actions">
          <Button appearance="primary" disabled={busy} onClick={() => void run(() => saveAdditionalRAI(project.demandId, email.trim() || null, currentRevision))}>Save</Button>
          <Button disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
        </div>
      </div>}
    </div>
  </section>;
}
