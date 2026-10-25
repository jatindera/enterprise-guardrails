import { useState } from "react";
import { parseIntake } from "./intake/parseIntake";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

export interface IntakeDraft {
  demandId: string;
  name: string;
  businessFunction?: string;
  assignedEA?: string;
  assignedSecurity?: string;
  markdown: string;
  fileName: string;
  expectedRevision?: number;
}

interface IntakeImportProps {
  open: boolean;
  existingDemandIds: string[];
  existingProjectRevisions: Record<string, number>;
  onClose: () => void;
  onImport: (draft: IntakeDraft) => Promise<void>;
}

export default function IntakeImport({
  open,
  existingDemandIds,
  existingProjectRevisions,
  onClose,
  onImport,
}: IntakeImportProps) {
  const [method, setMethod] =
    useState<"file" | "dataverse">("file");

  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demandId, setDemandId] = useState("");

  const isExisting =
    draft !== null && existingDemandIds.includes(draft.demandId);

  async function handleFile(file: File | undefined) {
    setDraft(null);
    setError("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".md")) {
      setError("Please select a Markdown file with the .md extension.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Please select a file smaller than 2 MB.");
      return;
    }

    setReading(true);

    try {
      const markdown = await file.text();

      if (!markdown.trim()) {
        throw new Error("The selected file is empty.");
      }

      const parsed = parseIntake(markdown, file.name);
      setDraft({
        ...parsed,
        expectedRevision: existingProjectRevisions[parsed.demandId],
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read the intake file.",
      );
    } finally {
      setReading(false);
    }
  }

  async function submitImport() {
    if (!draft || reading || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onImport(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open && !submitting) onClose();
      }}
    >
      <DialogSurface className="intake-dialog">
        <DialogBody>
          <DialogTitle>Add project from IT Intake</DialogTitle>

          <DialogContent>
            <p className="intake-description">
              Upload an export or retrieve the approved intake
              through a read-only Dataverse connection.
            </p>

            <div
              className="intake-methods"
              aria-label="Intake source"
            >
              <Button
                appearance={
                  method === "file" ? "primary" : "secondary"
                }
                aria-pressed={method === "file"}
                disabled={reading || submitting}
                onClick={() => setMethod("file")}
              >
                Upload .md file
              </Button>

              <Button
                appearance={
                  method === "dataverse"
                    ? "primary"
                    : "secondary"
                }
                aria-pressed={method === "dataverse"}
                disabled={reading || submitting}
                onClick={() => setMethod("dataverse")}
              >
                Retrieve by Demand ID
              </Button>
            </div>

            {method === "file" ? (
              <div className="intake-method-panel">
                <label
                  htmlFor="intake-markdown"
                  className="intake-field-label"
                >
                  Intake export (.md)
                </label>

                <input
                  id="intake-markdown"
                  type="file"
                  accept=".md,text/markdown"
                  disabled={reading || submitting}
                  onChange={(event) => {
                    void handleFile(event.target.files?.[0]);
                  }}
                />

                {reading && (
                  <p role="status">Reading intake file…</p>
                )}

                {error && (
                  <div className="intake-message">
                    <MessageBar intent="error">
                      <MessageBarBody>{error}</MessageBarBody>
                    </MessageBar>
                  </div>
                )}

                {draft && (
                  <section
                    className="intake-preview"
                    aria-label="Intake preview"
                  >
                    <h3>Project preview</h3>

                    <dl>
                      <dt>Demand ID</dt>
                      <dd>{draft.demandId}</dd>

                      <dt>Project</dt>
                      <dd>{draft.name}</dd>

                      <dt>Business function</dt>
                      <dd>
                        {draft.businessFunction || "Not provided"}
                      </dd>

                      <dt>Assigned EA</dt>
                      <dd>{draft.assignedEA || "Not provided"}</dd>

                      <dt>Assigned Security reviewer</dt>
                      <dd>{draft.assignedSecurity || "Not assigned"}</dd>

                      <dt>Assigned RAI manager</dt>
                      <dd>{isExisting ? "Existing RAI assignment will be retained" : "Chris Cawthon"}</dd>

                      <dt>Source</dt>
                      <dd>{draft.fileName}</dd>
                    </dl>

                    <MessageBar intent="info">
                      <MessageBarBody>
                        {isExisting
                          ? "This Demand ID already exists. Import will update its intake details while preserving current review statuses, ratings, and actions."
                          : "A new project will be added. Review decisions and ratings will remain pending until confirmed."}
                      </MessageBarBody>
                    </MessageBar>

                    <p className="intake-help">
                      This importer reads project identity,
                      business function, assigned EA, and Security reviewer. It retains
                      the original Markdown for later processing.
                      It does not interpret approvals from the file.
                    </p>
                  </section>
                )}
              </div>
            ) : (
              <div className="intake-method-panel">
                <MessageBar intent="warning">
                  <MessageBarBody>
                    Dataverse connection not configured.
                  </MessageBarBody>
                </MessageBar>

                <label
                  htmlFor="intake-demand-id"
                  className="intake-field-label"
                >
                  Demand ID
                </label>

                <Input
                  id="intake-demand-id"
                  value={demandId}
                  inputMode="numeric"
                  placeholder="e.g. 3601"
                  onChange={(_, data) =>
                    setDemandId(data.value)
                  }
                />

                <div className="intake-message">
                  <Button disabled>Retrieve intake</Button>
                </div>

                <p className="intake-help">
                  Retrieval will use the FastAPI backend.
                  IT Intake will not be modified. Use the
                  Markdown option until that connection is ready.
                </p>
              </div>
            )}

            <p className="intake-help">
              Project details and intake snapshots are stored in Azure SQL.
              Review decisions and uploaded evidence still remain in memory.
            </p>
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" disabled={submitting} onClick={onClose}>
              Cancel
            </Button>

            {method === "file" && (
              <Button
                appearance="primary"
                disabled={!draft || reading || submitting}
                onClick={() => void submitImport()}
              >
                {submitting ? "Saving…" : isExisting ? "Update intake details" : "Add project"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}