import { useState } from "react";
import { Button, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { useAuth } from "./auth/AuthGate";
import type { Project } from "./types";

interface Props {
  project: Project;
  onSave: (demandId: string, name: string, expectedRevision: number) => Promise<void>;
}
export default function ProjectReviewers({ project, onSave }: Props) {
  const user = useAuth();
  const isAdmin = user.roles.includes("Admin");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [revision, setRevision] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const rai = project.assignedRAI ?? "Chris Cawthon";
  function edit() {
    setName(rai); setRevision(project.revision); setError(""); setSaved(false); setEditing(true);
  }
  async function save() {
    if (busy || !isAdmin || revision === undefined) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 320) { setError("Enter a RAI manager name of up to 320 characters."); return; }
    setBusy(true); setError("");
    try { await onSave(project.demandId, trimmed, revision); setEditing(false); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save assignment."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Project reviewers" style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #dce7f1" }}>
      <h3 style={{ marginTop: 0 }}>Assigned reviewers</h3>
      <dl className="workspace-facts">
        <div><dt>Assigned EA</dt><dd>{project.assignedEA || "Not assigned"}</dd></div>
        <div><dt>Assigned Security reviewer</dt><dd>{project.assignedSecurity || "Not assigned"}</dd></div>
        <div><dt>Assigned RAI manager</dt><dd>{rai}</dd></div>
      </dl>
      <p className="workspace-secondary">EA and Security assignments come from IT Intake and are read-only here.</p>
      {saved && <p role="status">RAI assignment saved.</p>}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {isAdmin && !editing && <Button disabled={project.revision === undefined} onClick={edit}>Edit RAI manager</Button>}
      {isAdmin && editing && (
        <div style={{ display: "grid", gap: 12, maxWidth: 440 }}>
          <label className="session-field">RAI manager
            <Input value={name} maxLength={320} disabled={busy} onChange={(_, data) => setName(data.value)} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button appearance="primary" disabled={busy || !name.trim() || revision === undefined} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
            <Button disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
