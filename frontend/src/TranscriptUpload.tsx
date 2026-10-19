import { useRef, useState } from "react";
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

export interface TranscriptAttachment {
  fileName: string;
  text: string;
  attachedAt: string;
}

interface TranscriptUploadProps {
  onAttachmentChange: (
    attachment: TranscriptAttachment | null,
  ) => void;
}

export default function TranscriptUpload({
  onAttachmentChange,
}: TranscriptUploadProps) {
  const [attachment, setAttachment] =
    useState<TranscriptAttachment | null>(null);

  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  async function attachFile(file: File | undefined) {
    setError("");

    if (!file) return;

    if (!/\.(txt|vtt|md)$/i.test(file.name)) {
      setError("Select a .txt, .vtt, or .md transcript.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Select a transcript smaller than 2 MB.");
      return;
    }

    setReading(true);

    try {
      const text = await file.text();

      if (!text.trim()) {
        throw new Error("The transcript is empty.");
      }

      const nextAttachment: TranscriptAttachment = {
        fileName: file.name,
        text,
        attachedAt: new Date().toISOString(),
      };

      setAttachment(nextAttachment);
      onAttachmentChange(nextAttachment);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read the transcript.",
      );
    } finally {
      setReading(false);
    }
  }

  function removeAttachment() {
    onAttachmentChange(null);
    setError("");

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  return (
    <section
      className="content-panel transcript-panel"
      aria-labelledby="transcript-upload-heading"
    >
      <div className="panel-heading">
        <h2 id="transcript-upload-heading">
          Meeting transcript
        </h2>

        <Badge appearance="tint" color="informative">
          Local attachment
        </Badge>
      </div>

      <div className="workspace-panel-body">
        <p className="session-body-text">
          Attach the transcript after this meeting. The connected
          agent will compare it with captured notes and previous
          evidence, then propose findings for reviewer confirmation.
        </p>

        <label className="session-field">
          Transcript export (.txt, .vtt, .md)

          <input
            ref={fileInput}
            type="file"
            accept=".txt,.vtt,.md,text/plain,text/vtt,text/markdown"
            disabled={reading}
            onChange={(event) => {
              void attachFile(event.target.files?.[0]);
            }}
          />
        </label>

        {reading && <p role="status">Reading transcript…</p>}

        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}

        {attachment && (
          <div>
            <div className="transcript-attachment-summary">
              <div>
                <strong>{attachment.fileName}</strong>

                <p className="workspace-secondary">
                  Attached locally:{" "}
                  {new Date(
                    attachment.attachedAt,
                  ).toLocaleString()}
                </p>
              </div>

              <Button
                onClick={removeAttachment}
                disabled={reading}
              >
                Remove attachment
              </Button>
            </div>

            <details className="session-history">
              <summary>View original transcript</summary>

              <pre className="intake-source-text">
                {attachment.text}
              </pre>
            </details>

            {/* <div className="transcript-analysis-actions">
              <Button appearance="primary" disabled>
                Analyze transcript with AI
              </Button>
            </div> */}

            <MessageBar intent="info">
              <MessageBarBody>
                AI transcript analysis is awaiting FastAPI and
                Foundry integration. No findings, decisions, or
                actions have been extracted from this file.
              </MessageBarBody>
            </MessageBar>
          </div>
        )}

        <p className="workspace-secondary">
          This transcript is available to the AI meeting review below.
  Original text and source references remain separate from
  proposed findings.
        </p>
      </div>
    </section>
  );
}