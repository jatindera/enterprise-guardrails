import { useProjectUpdate } from "./ProjectUpdates";
import { useState } from "react";
import ARBVoting from "./ARBVoting";

import {
  Badge,
  Button,
  Checkbox,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

import FileDropZone from "./FileDropZone";
import type { Project } from "./types";

interface ARBReviewProps {
  project: Project;
  canEditDocuments: boolean;
  active?: boolean;
}

type ArtifactKind =
  | "ADR PowerPoint"
  | "Transcript"
  | "Supporting document";

interface ARBArtifact {
  id: string;
  kind: ArtifactKind;
  file: File;
  addedAt: string;
}

const documentGroups: {
  kind: ArtifactKind;
  label: string;
  extensions: string[];
}[] = [
    {
      kind: "Supporting document",
      label: "Documents for ADR preparation",
      extensions: [
        ".pdf",
        ".docx",
        ".pptx",
        ".txt",
        ".vtt",
        ".md",
        ".png",
        ".jpg",
        ".jpeg",
        ".drawio",
        ".vsdx",
      ],
    },
  ];



export default function ARBReview({ project, canEditDocuments, active = true }: ARBReviewProps) {
  const updateProject = useProjectUpdate(project.demandId);
  // Retain the initial applicability during this workspace session.
  const [initiallyRequired] = useState(
    project.arbStatus !== "Not applicable",
  );

  const [previousARB, setPreviousARB] = useState<{
    status: Project["arbStatus"];
    completionDate?: string;
  }>({
    status:
      project.arbStatus === "Not applicable"
        ? "Not scheduled"
        : project.arbStatus,
    completionDate: project.arbCompletionDate,
  });

  const notApplicable = project.arbStatus === "Not applicable";

  function changeApplicability(checked: boolean) {
    if (!initiallyRequired || !canEditDocuments) return;

    setError("");
    setMessage("");

    if (checked) {
      setPreviousARB({
        status: project.arbStatus,
        completionDate: project.arbCompletionDate,
      });

      updateProject({
        arbStatus: "Not applicable",
        arbCompletionDate: undefined,
      });
    } else {
      const canRestoreCompletion =
        previousARB.status === "Completed" &&
        project.eaStatus === "Approved";

      updateProject({
        arbStatus:
          previousARB.status === "Completed" &&
            !canRestoreCompletion
            ? "In progress"
            : previousARB.status,
        arbCompletionDate: canRestoreCompletion
          ? previousARB.completionDate
          : undefined,
      });
    }
  }
  const [activeTab, setActiveTab] = useState<"documents" | "vote">("documents");
  const [artifacts, setArtifacts] = useState<ARBArtifact[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function attachFiles(files: File[], kind: ArtifactKind) {
    if (!canEditDocuments) return;
    setError("");
    setMessage("");

    if (files.length === 0) return;

    const group = documentGroups.find((item) => item.kind === kind);

    if (!group) return;

    const invalid = files.find(
      (file) =>
        !group.extensions.some((extension) =>
          file.name.toLowerCase().endsWith(extension)
        ) ||
        file.size === 0 ||
        file.size > 20 * 1024 * 1024
    );

    if (invalid) {
      setError(
        `No files added. Check "${invalid.name}". ` +
        "Use a supported, nonempty file no larger than 20 MB."
      );
      return;
    }

    const addedAt = new Date().toISOString();

    const additions: ARBArtifact[] = files.map((file) => ({
      id: crypto.randomUUID(),
      kind,
      file,
      addedAt,
    }));

    setArtifacts((current) => [...current, ...additions]);

    setMessage(
      `${files.length} file${files.length === 1 ? "" : "s"} added locally.`
    );
  }

  function downloadArtifact(artifact: ARBArtifact) {
    const url = URL.createObjectURL(artifact.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = artifact.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="arb-review">
      <div className="session-heading">
        <div>
          <h2>ARB review</h2>
          <p>
            Demand #{project.demandId}
            {" · "}
            Presenting EA: {project.assignedEA}
          </p>
        </div>

        <Badge
          appearance="tint"
          color={
            project.arbStatus === "Completed"
              ? "success"
              : project.arbStatus === "Returned for review"
                ? "warning"
                : "informative"
          }
        >
          {project.arbStatus}
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Votes are saved in the database. Documents remain local and clear on refresh;
          document storage and ADR generation await integration.
        </MessageBarBody>
      </MessageBar>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {message && (
        <MessageBar intent="success">
          <MessageBarBody>{message}</MessageBarBody>
        </MessageBar>
      )}
      <section className="content-panel arb-section">
        <div className="workspace-panel-body">
          <Checkbox
            label="ARB is not applicable to this project"
            checked={notApplicable}
            disabled={!initiallyRequired || !canEditDocuments}
            onChange={(_, data) =>
              changeApplicability(data.checked === true)
            }
          />

          {notApplicable && (
            <p className="workspace-secondary">
              No ARB meeting or voting is required. Existing documents
              and records are retained.
            </p>
          )}
        </div>
      </section>

      <div hidden={notApplicable}>
        <div className="meeting-review-actions" role="group" aria-label="ARB review sections">
          <Button appearance={activeTab === "documents" ? "primary" : "secondary"}
            aria-pressed={activeTab === "documents"} onClick={() => setActiveTab("documents")}>
            ADR & meeting documents
          </Button>
          <Button appearance={activeTab === "vote" ? "primary" : "secondary"}
            aria-pressed={activeTab === "vote"} onClick={() => setActiveTab("vote")}>
            Core Team Vote
          </Button>
        </div>

        <div hidden={activeTab !== "documents"}>
        {!canEditDocuments && <p className="workspace-secondary">ADR documents are read-only for your account.</p>}
        <fieldset disabled={!canEditDocuments} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <section className="content-panel arb-section">
          <div className="panel-heading">
            <h2>ADR & meeting documents</h2>

            <Badge appearance="tint" color="informative">
              {artifacts.length} files
            </Badge>
          </div>

          <div className="workspace-panel-body">


            <p className="workspace-secondary">
              Select several files together or drag and drop them.
              Upload again anytime to add more. Revised ADR decks
              are retained as additional attachments.
            </p>

            <div className="arb-upload-grid">
              {documentGroups.map((group) => (
                <FileDropZone
                  key={group.kind}
                  label={group.label}
                  extensions={group.extensions}
                  onFiles={(files) => attachFiles(files, group.kind)}
                />
              ))}
            </div>

            <h3>Uploaded documents ({artifacts.length})</h3>

            {artifacts.length === 0 ? (
              <p className="workspace-secondary">
                No documents uploaded yet.
              </p>
            ) : (
              artifacts.map((artifact, index) => (
                <article className="ea-record" key={artifact.id}>
                  <Badge appearance="tint">
                    {artifact.kind}
                  </Badge>

                  <h4>
                    {index + 1}. {artifact.file.name}
                  </h4>

                  <p className="workspace-secondary">
                    Added: {new Date(artifact.addedAt).toLocaleString()}
                    {" · "}
                    {(artifact.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  <Button onClick={() => downloadArtifact(artifact)}>
                    Download
                  </Button>
                </article>
              ))
            )}
            <div className="arb-generation-box">
              <h3>Create ADR from project information</h3>

              <p className="workspace-secondary">
                Upload transcripts, architecture diagrams, and supporting
                documents. Select multiple files together or drag and drop them.
                You can add more files later. The predefined ADR template is
                stored centrally and does not need to be uploaded here.
              </p>

              <div className="meeting-review-actions">
                <Button disabled>Generate ADR PowerPoint</Button>

                <Badge appearance="tint" color="warning">
                  Awaiting template and agent integration
                </Badge>
              </div>
            </div>
          </div>
        </section>
        </fieldset>
        </div>
        <div hidden={activeTab !== "vote"}>
          <ARBVoting key={project.demandId} demandId={project.demandId}
            active={active && activeTab === "vote" && !notApplicable} />
        </div>
      </div>
    </section>
  );
}
