import { useProjectUpdate } from "./ProjectUpdates";
import { useEffect, useRef, useState } from "react";
import ARBVoting from "./ARBVoting";
import { useAuth } from "./auth/AuthGate";
import { getProject, updateARBApplicability, type ProjectRecord } from "./api/projects";

import {
  Badge,
  Button,
  Checkbox,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

import FileDropZone from "./FileDropZone";
import type { Project } from "./types";
import type { ARBVotingResult } from "./api/projects";

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
  const [votingResult, setVotingResult] = useState<ARBVotingResult | null>(null);
  useEffect(() => {
    if (!votingResult || project.arbRequired !== true) return;
    let status: Project["arbStatus"] | undefined;
    let completedAt: string | undefined;
    if (votingResult.status === "Closed") {
      if (votingResult.outcome === "Passed" && project.eaStatus === "Approved") {
        status = "Completed";
        completedAt = votingResult.closedAt ?? undefined;
      } else {
        status = votingResult.outcome === "Returned for review" ? "Returned for review" : "In progress";
      }
    } else if (votingResult.roundNumber > 1 || votingResult.total > 0) {
      status = "In progress";
    }
    if (status && (project.arbStatus !== status || project.arbCompletionDate !== completedAt)) {
      // Portfolio decisions remain on the existing frontend path until assessment persistence.
      updateProject({ arbStatus: status, arbCompletionDate: completedAt });
    }
  }, [votingResult, project.arbRequired, project.arbStatus, project.eaStatus, project.arbCompletionDate, updateProject]);

  const { roles } = useAuth();
  const isAdmin = roles.includes("Admin");
  const [applicability, setApplicability] = useState<{ required: boolean; revision: number } | null>(null);
  const [loadingApplicability, setLoadingApplicability] = useState(true);
  const [savingApplicability, setSavingApplicability] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  function applyApplicability(record: ProjectRecord) {
    setApplicability({ required: record.arbRequired, revision: record.revision });
    const previous = projectRef.current;
    updateProject({
      arbRequired: record.arbRequired, revision: record.revision,
      arbStatus: record.arbRequired
        ? (previous.arbStatus === "Not applicable" ? "Not scheduled" : previous.arbStatus)
        : "Not applicable",
      ...(!record.arbRequired ? { arbCompletionDate: undefined } : {}),
    });
  }
  const applyRef = useRef(applyApplicability);
  applyRef.current = applyApplicability;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoadingApplicability(true);
    getProject(project.demandId).then((record) => {
      if (!cancelled) applyRef.current(record);
    }).catch((cause) => {
      if (!cancelled) {
        setApplicability(null);
        setError(cause instanceof Error ? cause.message : "Could not load ARB applicability. Refresh to retry.");
      }
    }).finally(() => { if (!cancelled) setLoadingApplicability(false); });
    return () => { cancelled = true; };
  }, [project.demandId, active, project.arbRequired]);

  const notApplicable = !applicability?.required;

  async function changeApplicability(checked: boolean) {
    if (!isAdmin || !applicability || savingApplicability || loadingApplicability) return;
    setSavingApplicability(true);
    setError("");
    setMessage("");
    try {
      const record = await updateARBApplicability(project.demandId, !checked, applicability.revision);
      applyRef.current(record);
      setVotingResult(null);
      setMessage("ARB applicability saved. The next intake import will apply its latest value.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save ARB applicability.");
      // Reload a possibly changed revision; never display an optimistic toggle.
      try { applyRef.current(await getProject(project.demandId)); } catch { setApplicability(null); }
    } finally {
      setSavingApplicability(false);
    }
  }
  const [activeTab, setActiveTab] = useState<"documents" | "vote">("vote");
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
            checked={applicability ? notApplicable : project.arbRequired !== true}
            disabled={!isAdmin || !applicability || loadingApplicability || savingApplicability}
            onChange={(_, data) =>
              changeApplicability(data.checked === true)
            }
          />

          {loadingApplicability && <p className="workspace-secondary">Loading ARB applicability…</p>}
          {!isAdmin && <p className="workspace-secondary">Only an administrator can change ARB applicability.</p>}
          {applicability && !loadingApplicability && notApplicable && (
            <p className="workspace-secondary">
              No ARB meeting or voting is required.
            </p>
          )}
        </div>
      </section>

      {applicability && !loadingApplicability && !notApplicable && <div>
        <div className="meeting-review-actions" role="group" aria-label="ARB review sections">
          <Button appearance={activeTab === "vote" ? "primary" : "secondary"}
            aria-pressed={activeTab === "vote"} onClick={() => setActiveTab("vote")}>
            Core Team Vote
          </Button>
          <Button appearance={activeTab === "documents" ? "primary" : "secondary"}
            aria-pressed={activeTab === "documents"} onClick={() => setActiveTab("documents")}>
            ADR & meeting documents
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
            active={active && activeTab === "vote" && !notApplicable}
            onCurrentResult={setVotingResult} />
        </div>
      </div>}
    </section>
  );
}
