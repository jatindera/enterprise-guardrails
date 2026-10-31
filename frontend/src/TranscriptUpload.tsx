import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button } from "@fluentui/react-components";
import "./TranscriptUpload.css";

export interface TranscriptAttachment {
  id: string;
  fileName: string;
  text: string;
  attachedAt: string;
  sizeBytes: number;
  file?: File;
}

interface TranscriptUploadProps {
  attachments: TranscriptAttachment[];
  onAttachmentChange: (attachments: TranscriptAttachment[]) => void;
  disabled?: boolean;
  staged?: boolean;
}

const FILE_LIMIT = 2 * 1024 * 1024;
const TOTAL_LIMIT = 10 * 1024 * 1024;
const MAX_FILES = 10;

export default function TranscriptUpload({ attachments, onAttachmentChange, disabled = false, staged = false }: TranscriptUploadProps) {
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const headingId = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function attachFiles(files: File[]) {
    if (disabled || locked.current || !files.length) return;
    locked.current = true;
    setReading(true); setErrors([]); setDragging(false);
    const next = [...attachments];
    const issues: string[] = [];
    for (const file of files) {
      if (!/\.(txt|vtt|md)$/i.test(file.name)) { issues.push(`${file.name}: use .txt, .vtt or .md.`); continue; }
      if (file.size > FILE_LIMIT) { issues.push(`${file.name}: maximum 2 MB per file.`); continue; }
      if (next.length >= MAX_FILES) { issues.push(`${file.name}: maximum 10 transcripts.`); continue; }
      if (next.reduce((sum, item) => sum + item.sizeBytes, 0) + file.size > TOTAL_LIMIT) {
        issues.push(`${file.name}: maximum 10 MB combined.`); continue;
      }
      try {
        const text = await file.text();
        if (!alive.current) return;
        if (!text.trim()) { issues.push(`${file.name}: the transcript is empty.`); continue; }
        if (next.some(item => item.fileName === file.name && item.text === text)) {
          issues.push(`${file.name}: this transcript is already attached.`); continue;
        }
        next.push({ id: crypto.randomUUID(), fileName: file.name, text, file,
          sizeBytes: file.size, attachedAt: new Date().toISOString() });
      } catch {
        issues.push(`${file.name}: could not read the file. Please try again.`);
      }
    }
    if (alive.current) {
      if (next.length !== attachments.length) onAttachmentChange(next);
      setErrors(issues); setReading(false);
    }
    locked.current = false;
  }

  return <section className="content-panel transcript-panel" aria-labelledby={headingId}>
    <div className="panel-heading">
      <h2 id={headingId}>{staged ? "Add meeting transcripts" : "Meeting transcripts"}</h2>
      <Badge appearance="tint" color="informative">{staged ? "Ready to upload" : "Local attachments"}</Badge>
    </div>
    <div className="workspace-panel-body">
      <p className="session-body-text">Attach transcripts from one or more meeting sessions.</p>
      <div className={`eg-transcript-drop${dragging ? " eg-transcript-drop--active" : ""}`}
        role="group" aria-label="Transcript upload"
        onDragOver={event => { event.preventDefault(); if (!disabled && !reading) setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={event => { event.preventDefault(); setDragging(false); void attachFiles(Array.from(event.dataTransfer.files)); }}>
        <strong>Drag and drop meeting transcripts here</strong>
        <span>or select multiple files from your computer</span>
        <Button appearance="primary" disabled={disabled || reading} onClick={() => fileInput.current?.click()}>Browse files</Button>
        <input ref={fileInput} type="file" multiple hidden aria-label="Meeting transcript files"
          accept=".txt,.vtt,.md,text/plain,text/vtt,text/markdown" disabled={disabled || reading}
          onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void attachFiles(files); }} />
        <small>.txt, .vtt or .md · Up to 10 files · 2 MB per file · 10 MB total</small>
      </div>
      {reading && <p role="status">Reading transcripts…</p>}
      {errors.length > 0 && <div role="alert" className="session-error">{errors.map((error, i) => <p key={i}>{error}</p>)}</div>}
      <p className="workspace-secondary" aria-live="polite">{attachments.length} transcript{attachments.length === 1 ? "" : "s"} attached</p>
      <ul className="eg-transcript-list">
        {attachments.map(item => <li key={item.id}>
          <div className="transcript-attachment-summary">
            <div><strong>{item.fileName}</strong>
              <p className="workspace-secondary">{(item.sizeBytes / 1024).toFixed(1)} KB · Attached {new Date(item.attachedAt).toLocaleString()}</p></div>
            <Button disabled={disabled || reading} aria-label={`Remove ${item.fileName}`}
              onClick={() => { onAttachmentChange(attachments.filter(other => other.id !== item.id)); setErrors([]); }}>Remove</Button>
          </div>
          <details className="session-history"><summary>View original transcript</summary><pre className="intake-source-text">{item.text}</pre></details>
        </li>)}
      </ul>
      <p className="workspace-secondary">{staged ? "Selected files are not saved yet. Choose Save transcripts to upload them to permanent storage." : "Files stay in this workspace and clear on refresh. Permanent storage and AI transcript review will be connected in the next increment."}</p>
    </div>
  </section>;
}
