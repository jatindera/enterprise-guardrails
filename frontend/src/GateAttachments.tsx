import { useEffect, useRef, useState } from "react";
import { Badge, Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import FileDropZone from "./FileDropZone";
import { downloadGateAttachment, getGateAttachments, uploadGateAttachment, type GateAttachment } from "./api/projects";

interface Props { demandId: string; active: boolean; canUpload: boolean; }
interface PendingUpload { id: string; file: File; state: "Queued" | "Uploading" | "Failed"; error?: string; }
export default function GateAttachments({ demandId, active, canUpload }: Props) {
  const [items, setItems] = useState<GateAttachment[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const working = useRef(false);
  const sequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      if (working.current || document.hidden) return;
      const current = ++sequence.current;
      try {
        const result = await getGateAttachments(demandId, controller.signal);
        if (!cancelled && current === sequence.current) { setItems(result.items); setPending((current) => current.filter((item) => !result.items.some((saved) => saved.id === item.id))); setError(""); }
      } catch (cause) {
        if (!cancelled && current === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load attachments.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [active, demandId]);

  async function send(entries: PendingUpload[]) {
    if (!canUpload || working.current) return;
    working.current = true; ++sequence.current; setBusy(true); setError(""); setMessage("");
    let uploaded = 0;
    try {
      for (const entry of entries) {
        if (!alive.current) break;
        setPending((current) => current.map((item) => item.id === entry.id ? { ...item, state: "Uploading", error: undefined } : item));
        try {
          const saved = await uploadGateAttachment(demandId, entry.id, entry.file);
          if (!alive.current) break;
          setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          setPending((current) => current.filter((item) => item.id !== entry.id));
          uploaded += 1;
        } catch (cause) {
          if (!alive.current) break;
          setPending((current) => current.map((item) => item.id === entry.id ? { ...item, state: "Failed", error: cause instanceof Error ? cause.message : "Upload failed." } : item));
        }
      }
      if (alive.current && uploaded) setMessage(`${uploaded} attachment${uploaded === 1 ? "" : "s"} saved to storage.`);
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function selectFiles(files: File[]) {
    if (!canUpload || working.current) return;
    const entries: PendingUpload[] = files.map((file) => ({ id: crypto.randomUUID(), file, state: "Queued" }));
    setPending((current) => [...current, ...entries]);
    void send(entries);
  }
  async function download(item: GateAttachment) {
    setError("");
    try {
      const blob = await downloadGateAttachment(demandId, item.id);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = item.fileName; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
  }
  return <section className="workspace-content-panel gate-section">
    <div className="session-heading"><h3 className="session-subheading">Supporting documents — optional</h3><Badge appearance="tint">{items.length} saved</Badge></div>
    <p className="workspace-secondary">Shared with all reviewers. Files are stored privately and remain available after refresh.</p>
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {message && <MessageBar intent="success"><MessageBarBody>{message}</MessageBarBody></MessageBar>}
    <fieldset disabled={!canUpload || busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <FileDropZone label="Implementation evidence" extensions={[".pdf", ".docx", ".pptx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg"]}
        selectionMessage="Files selected for upload. Check the status below." onFiles={selectFiles} />
    </fieldset>
    {pending.map((entry) => <article className="ea-record" key={entry.id}><strong>{entry.file.name}</strong><p>{entry.state}</p>
      {entry.error && <p className="session-error">{entry.error}</p>}
      {entry.state === "Failed" && <Button disabled={!canUpload || busy} onClick={() => void send([entry])}>Retry upload</Button>}
    </article>)}
    {loading && <p className="workspace-secondary">Loading attachments…</p>}
    {!loading && items.length === 0 && <p className="workspace-secondary">No saved attachments.</p>}
    {items.map((item) => <article className="ea-record" key={item.id}>
      <strong>{item.fileName}</strong><p className="workspace-secondary">{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB · Uploaded by {item.uploadedByName} · {new Date(item.uploadedAt).toLocaleString()}</p>
      <Button onClick={() => void download(item)}>Download</Button>
    </article>)}
  </section>;
}
