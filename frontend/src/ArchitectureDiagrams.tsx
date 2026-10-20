import { useRef, useState } from "react";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

import type { AcceptedMeetingReview, Project } from "./types";

interface ArchitectureDiagramsProps {
  project: Project;
  acceptedReview: AcceptedMeetingReview | null;
  onCurrentDiagramChange?: (
    diagram: CurrentDiagramReference
  ) => void;
}

interface DiagramVersion {
  id: string;
  version: number;
  file: File;
  description: string;
  uploadedAt: string;
}

export interface CurrentDiagramReference {
  id: string;
  version: number;
  fileName: string;
  description: string;
  uploadedAt: string;
}

const allowedExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".pdf",
  ".drawio",
  ".vsdx",
];

const maximumFileSize = 20 * 1024 * 1024;

export default function ArchitectureDiagrams({
  project,
  acceptedReview,
  onCurrentDiagramChange,
}: ArchitectureDiagramsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [diagrams, setDiagrams] = useState<DiagramVersion[]>([]);
  const [currentDiagramId, setCurrentDiagramId] =
    useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function selectFile(file: File | undefined) {
    setError("");
    setMessage("");
    setSelectedFile(null);

    if (!file) {
      return;
    }

    const name = file.name.toLowerCase();
    const supported = allowedExtensions.some((extension) =>
      name.endsWith(extension)
    );

    if (!supported) {
      setError(
        "Choose a PNG, JPG, SVG, PDF, Draw.io, or Visio (.vsdx) file."
      );
      return;
    }

    if (file.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    if (file.size > maximumFileSize) {
      setError("Choose a file smaller than or equal to 20 MB.");
      return;
    }

    setSelectedFile(file);
  }

  function addDiagram() {
    if (!selectedFile) {
      setError("Select a diagram file first.");
      return;
    }

    if (!description.trim()) {
      setError("Add a short description of this diagram version.");
      return;
    }

    const nextVersion =
      Math.max(0, ...diagrams.map((diagram) => diagram.version)) + 1;

    const diagram: DiagramVersion = {
      id: crypto.randomUUID(),
      version: nextVersion,
      file: selectedFile,
      description: description.trim(),
      uploadedAt: new Date().toISOString(),
    };

    setDiagrams((current) => [...current, diagram]);
    setSelectedFile(null);
    setDescription("");
    setError("");
    setMessage(
      `Version ${nextVersion} added. Use “Mark as current” when it is ready for reviewers.`
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function markAsCurrent(diagram: DiagramVersion) {
  setCurrentDiagramId(diagram.id);

  onCurrentDiagramChange?.({
    id: diagram.id,
    version: diagram.version,
    fileName: diagram.file.name,
    description: diagram.description,
    uploadedAt: diagram.uploadedAt,
  });

  setMessage(`Version ${diagram.version} is now the current diagram.`);
  setError("");
}

  function downloadDiagram(diagram: DiagramVersion) {
    const url = URL.createObjectURL(diagram.file);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `${project.demandId}-architecture-v${diagram.version}-` +
      diagram.file.name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="content-panel architecture-diagrams">
      <div className="panel-heading">
        <h2>Architecture diagrams</h2>

        <Badge appearance="tint" color="informative">
          {diagrams.length} versions
        </Badge>
      </div>

      <div className="workspace-panel-body">
        <MessageBar intent="info">
          <MessageBarBody>
            Files are held locally while this workspace remains mounted.
            Refreshing or leaving the project clears them. Permanent
            storage and AI diagram generation await backend integration.
          </MessageBarBody>
        </MessageBar>

        <div className="diagram-ai-section">
          <Button appearance="primary" disabled>
            Create diagram with AI
          </Button>

          <Badge appearance="tint" color="warning">
            Awaiting agent integration
          </Badge>

          <p className="workspace-secondary">
            The connected agent will use intake, confirmed requirements,
            accepted meeting evidence, and diagram rules to propose a
            draft for architect review.
          </p>

          <p className="workspace-secondary">
            Intake:{" "}
            {project.intakeSource
              ? "Imported markdown available"
              : "Project summary only"}
            {" · "}
            Accepted meeting review:{" "}
            {acceptedReview ? "Available" : "Not yet available"}
          </p>
        </div>

        <h3>Upload a diagram version</h3>

        <p className="workspace-secondary">
          Upload an existing diagram or a version edited outside this app.
          Each upload adds a version without replacing earlier files.
        </p>

        <label className="session-field">
          Diagram file
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedExtensions.join(",")}
            onChange={(event) =>
              selectFile(event.currentTarget.files?.[0])
            }
          />
        </label>

        {selectedFile && (
          <p className="workspace-secondary">
            Selected: {selectedFile.name}
            {" · "}
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        )}

        <label className="session-field">
          Version description
          <Textarea
            value={description}
            rows={3}
            placeholder="For example: Added SharePoint destination and labelled data flows."
            onChange={(_, data) => setDescription(data.value)}
          />
        </label>

        <Button
          appearance="primary"
          disabled={!selectedFile || !description.trim()}
          onClick={addDiagram}
        >
          Add diagram version
        </Button>

        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="workspace-secondary" role="status">
            {message}
          </p>
        )}

        <h3>Diagram versions</h3>

        {diagrams.length === 0 ? (
          <p className="workspace-secondary">
            No diagrams uploaded yet.
          </p>
        ) : (
          <div className="diagram-version-list">
            {[...diagrams].reverse().map((diagram) => {
              const isCurrent = diagram.id === currentDiagramId;

              return (
                <article className="diagram-version" key={diagram.id}>
                  <div className="workspace-tags">
                    <Badge appearance="tint" color="brand">
                      Version {diagram.version}
                    </Badge>

                    {isCurrent && (
                      <Badge appearance="filled" color="success">
                        Current
                      </Badge>
                    )}
                  </div>

                  <h4>{diagram.file.name}</h4>

                  <p className="diagram-description">
                    {diagram.description}
                  </p>

                  <p className="workspace-secondary">
                    Uploaded:{" "}
                    {new Date(diagram.uploadedAt).toLocaleString()}
                  </p>

                  <div className="meeting-review-actions">
                    <Button onClick={() => downloadDiagram(diagram)}>
                      Download
                    </Button>

                    <Button
                      appearance={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent}
                      onClick={() => markAsCurrent(diagram)}
                    >
                      {isCurrent ? "Current diagram" : "Mark as current"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="workspace-secondary">
          “Current” identifies the diagram to reference. It does not
          constitute EA approval.
        </p>
      </div>
    </section>
  );
}