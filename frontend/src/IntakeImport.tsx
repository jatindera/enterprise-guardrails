import { useState } from "react";
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
  markdown: string;
  fileName: string;
}

interface IntakeImportProps {
  open: boolean;
  existingDemandIds: string[];
  onClose: () => void;
  onImport: (draft: IntakeDraft) => void;
}

function cleanLine(line: string): string {
  return line
    .replace(/\\([*#:_-])/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*-\s*/, "")
    .trim();
}

function readField(
  lines: string[],
  fieldName: string,
): string | undefined {
  const prefix = `${fieldName.toLowerCase()}:`;

  const line = lines.find((value) =>
    value.toLowerCase().startsWith(prefix),
  );

  return line?.slice(prefix.length).trim() || undefined;
}

function parseIntake(
  markdown: string,
  fileName: string,
): IntakeDraft {
  const lines = markdown
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const demandLine = lines.find((line) =>
    /^Demand\s*Id\s*[-:]/i.test(line),
  );

  const demandMatch = demandLine?.match(
    /^Demand\s*Id\s*[-:]\s*(\d+)\s*$/i,
  );

  if (!demandMatch) {
    throw new Error(
      "A numeric Demand ID was not found. Expected: Demand Id - 3601",
    );
  }

  const titleField = readField(lines, "Title");

  // The export normally has the project heading immediately
  // before its Demand ID heading.
  const demandIndex = lines.indexOf(demandLine!);
  const headingBeforeDemand =
    demandIndex > 0 ? lines[demandIndex - 1] : undefined;

  const name = titleField || headingBeforeDemand;

  if (!name) {
    throw new Error(
      "Project name was not found. Include a project heading or Title field.",
    );
  }

  const architectField = readField(lines, "Architect Assigned");

  // Convert a Markdown email link into its visible label.
  const assignedEA = architectField
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  return {
    demandId: demandMatch[1].replace(/^0+(?=\d)/, ""),
    name,
    businessFunction: readField(
      lines,
      "Demand Stakeholder LOB or Function",
    ),
    assignedEA:
      assignedEA &&
      !/^(not assigned|not selected|not specified)$/i.test(assignedEA)
        ? assignedEA
        : undefined,
    markdown,
    fileName,
  };
}

export default function IntakeImport({
  open,
  existingDemandIds,
  onClose,
  onImport,
}: IntakeImportProps) {
  const [method, setMethod] =
    useState<"file" | "dataverse">("file");

  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
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

      setDraft(parseIntake(markdown, file.name));
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

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
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
                  disabled={reading}
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
                      This first importer reads project identity,
                      business function, and assigned EA. It retains
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
              Development mode: imports are stored in browser
              memory only and are cleared on page reload.
            </p>
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>

            {method === "file" && (
              <Button
                appearance="primary"
                disabled={!draft || reading}
                onClick={() => {
                  if (draft) onImport(draft);
                }}
              >
                {isExisting ? "Update intake details" : "Add project"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}