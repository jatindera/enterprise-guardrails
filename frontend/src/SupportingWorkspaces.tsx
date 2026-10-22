import { useState } from "react";

import {
  Badge,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
} from "@fluentui/react-components";

import FileDropZone from "./FileDropZone";

import type {
  Project,
  TrackedCondition,
} from "./types";

type Domain = "EA" | "Security" | "RAI" | "ARB" | "Production gate";

interface ReferenceDocument {
  id: string;
  domain: Domain;
  title: string;
  file: File;
  addedAt: string;
}

interface TemplateVersion {
  id: string;
  version: number;
  file: File;
  addedAt: string;
}

interface ActionRow extends TrackedCondition {
  demandId: string;
  projectName: string;
  domain: "EA" | "Security" | "RAI";
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = file.name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function localDate() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function MyActions({
  projects,
  onOpenProject,
}: {
  projects: Project[];
  onOpenProject: (demandId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("Open");
  const [domainFilter, setDomainFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("");

  const today = localDate();

  const actions: ActionRow[] = projects.flatMap((project) => [
    ...(project.eaItems ?? []).map((item) => ({
      ...item,
      owner: project.assignedEA,
      demandId: project.demandId,
      projectName: project.name,
      domain: "EA" as const,
    })),

    ...(project.securityConditions ?? []).map((condition) => ({
      ...condition,
      demandId: project.demandId,
      projectName: project.name,
      domain: "Security" as const,
    })),

    ...(project.raiConditions ?? []).map((condition) => ({
      ...condition,
      demandId: project.demandId,
      projectName: project.name,
      domain: "RAI" as const,
    })),
  ]);

  function isOverdue(action: ActionRow) {
    return (
      action.status === "Open" &&
      Boolean(action.dueDate) &&
      action.dueDate < today
    );
  }

  const visibleActions = actions
    .filter(
      (action) =>
        (domainFilter === "All" ||
          action.domain === domainFilter) &&
        (statusFilter === "All" ||
          (statusFilter === "Overdue"
            ? isOverdue(action)
            : action.status === statusFilter)) &&
        (action.owner ?? "")
          .toLowerCase()
          .includes(ownerFilter.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const overdueDifference =
        Number(isOverdue(b)) - Number(isOverdue(a));

      return (
        overdueDifference ||
        (a.dueDate || "9999").localeCompare(
          b.dueDate || "9999",
        )
      );
    });

  return (
    <section className="supporting-workspace">
      <div className="page-heading">
        <div>
          <h1>My actions</h1>
          <p>
            Follow up on Security and Responsible AI conditions.
          </p>
        </div>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Showing actions across all owners. Search for your name
          below. Automatic assignment to the signed-in user will
          follow authentication integration.
        </MessageBarBody>
      </MessageBar>

      <section
        className="content-panel supporting-filters"
        aria-label="Action filters"
      >
        <label className="session-field">
          Status
          <Select
            value={statusFilter}
            onChange={(_, data) => setStatusFilter(data.value)}
          >
            <option value="Open">Open</option>
            <option value="Overdue">Overdue</option>
            <option value="Closed">Closed</option>
            <option value="All">All</option>
          </Select>
        </label>

        <label className="session-field">
          Review domain
          <Select
            value={domainFilter}
            onChange={(_, data) => setDomainFilter(data.value)}
          >
            <option value="All">All domains</option>
            <option value="EA">EA</option>
            <option value="Security">Security</option>
            <option value="RAI">Responsible AI</option>
          </Select>
        </label>

        <label className="session-field">
          Action owner
          <Input
            value={ownerFilter}
            placeholder="Search by name or email"
            onChange={(_, data) => setOwnerFilter(data.value)}
          />
        </label>

        <Button
          onClick={() => {
            setStatusFilter("Open");
            setDomainFilter("All");
            setOwnerFilter("");
          }}
        >
          Reset filters
        </Button>
      </section>

      <p className="workspace-secondary" role="status">
        {visibleActions.length} actions shown.
      </p>

      {visibleActions.length === 0 ? (
        <section className="supporting-panel">
          <p className="workspace-secondary">
  Open the project’s EA, Security, or RAI screen to update
  the item. Closure remains with the responsible reviewer.
</p>
        </section>
      ) : (
        visibleActions.map((action) => (
          <article
            className="supporting-panel"
            key={`${action.demandId}-${action.domain}-${action.id}`}
          >
            <div className="workspace-tags">
              <Badge appearance="tint" color="brand">
                {action.domain}
              </Badge>

              <Badge
                appearance="tint"
                color={
                  action.status === "Closed"
                    ? "success"
                    : isOverdue(action)
                      ? "danger"
                      : "warning"
                }
              >
                {isOverdue(action) ? "Overdue" : action.status}
              </Badge>
            </div>

            <h3>
              {action.description || "Condition details unavailable"}
            </h3>

            <p>
              #{action.demandId} · {action.projectName}
            </p>

            <p className="workspace-secondary">
              Owner: {action.owner || "Not recorded"}
              {" · "}
              Due: {action.dueDate || "Not recorded"}
            </p>

            {action.comments && (
              <p className="supporting-preserve-text">
                {action.comments}
              </p>
            )}

            <Button
              onClick={() => onOpenProject(action.demandId)}
            >
              Open project
            </Button>
          </article>
        ))
      )}

      <p className="workspace-secondary">
        Open the project’s Security or RAI screen to update
        comments or request closure. The assigned reviewer remains
        the closure authority.
      </p>
    </section>
  );
}

export function Knowledge() {
  const [documents, setDocuments] =
    useState<ReferenceDocument[]>([]);

  const [domain, setDomain] = useState<Domain>("EA");
  const [filter, setFilter] = useState("All");

  function attachDocuments(files: File[]) {
    const addedAt = new Date().toISOString();

    setDocuments((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        domain,
        title: file.name,
        file,
        addedAt,
      })),
    ]);
  }

  const visibleDocuments = documents.filter(
    (document) =>
      filter === "All" || document.domain === filter,
  );

  return (
    <section className="supporting-workspace">
      <div className="page-heading">
        <div>
          <h1>Knowledge</h1>
          <p>
            Reference material for architecture, Security,
            Responsible AI, ARB, and production reviews.
          </p>
        </div>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Add your organization’s questionnaires, diagram rules,
          standards, and guidance here. Agent retrieval and
          researched guidance will be connected later.
        </MessageBarBody>
      </MessageBar>

      <section className="supporting-panel supporting-panel--blue">
        <h2>Add reference documents</h2>

        <label className="session-field">
          Domain for uploaded documents
          <Select
            value={domain}
            onChange={(_, data) =>
              setDomain(data.value as Domain)
            }
          >
            <option value="EA">EA</option>
            <option value="Security">Security</option>
            <option value="RAI">Responsible AI</option>
            <option value="ARB">ARB</option>
            <option value="Production gate">Production gate</option>
          </Select>
        </label>

        <FileDropZone
          label="Reference documents"
          extensions={[
            ".pdf",
            ".docx",
            ".pptx",
            ".xlsx",
            ".txt",
            ".md",
          ]}
          onFiles={attachDocuments}
        />

        <p className="workspace-secondary">
          Select multiple documents or drag and drop them.
          Upload the default ADR PowerPoint template under
          Administration.
        </p>
      </section>

      <label className="session-field">
        Filter reference material
        <Select
          value={filter}
          onChange={(_, data) => setFilter(data.value)}
        >
          <option value="All">All domains</option>
          <option value="EA">EA</option>
          <option value="Security">Security</option>
          <option value="RAI">Responsible AI</option>
          <option value="ARB">ARB</option>
          <option value="Production gate">Production gate</option>
        </Select>
      </label>

      {visibleDocuments.length === 0 ? (
        <section className="supporting-panel">
          No reference documents in this view yet.
        </section>
      ) : (
        visibleDocuments.map((document) => (
          <article
            className="supporting-panel"
            key={document.id}
          >
            <Badge appearance="tint" color="brand">
              {document.domain}
            </Badge>

            <h3>{document.title}</h3>

            <p className="workspace-secondary">
              Added:{" "}
              {new Date(document.addedAt).toLocaleString()}
            </p>

            <Button onClick={() => downloadFile(document.file)}>
              Download
            </Button>
          </article>
        ))
      )}

      <p className="workspace-secondary">
        Documents are retained during this app session and clear
        on refresh. Adding a document does not automatically make
        it an approved organizational standard.
      </p>
    </section>
  );
}

export function Administration() {
  const [templates, setTemplates] =
    useState<TemplateVersion[]>([]);

  const [raiManager, setRAIManager] =
    useState("Chris Cawthon");

  const [savedRAIManager, setSavedRAIManager] =
    useState("Chris Cawthon");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentTemplate = templates[templates.length - 1];

  function attachTemplate(files: File[]) {
    setError("");
    setMessage("");

    if (files.length !== 1) {
      setError("Select one ADR PowerPoint template per upload.");
      return;
    }

    setTemplates((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        version: current.length + 1,
        file: files[0],
        addedAt: new Date().toISOString(),
      },
    ]);

    setMessage(
      "Default ADR template updated for this session. Agent integration is pending.",
    );
  }

  function saveSettings() {
    setError("");
    setMessage("");

    if (!raiManager.trim()) {
      setError("Enter the designated RAI manager.");
      return;
    }

    setSavedRAIManager(raiManager.trim());
    setMessage("Settings saved for this session.");
  }

  return (
    <section className="supporting-workspace">
      <div className="page-heading">
        <div>
          <h1>Administration</h1>
          <p>Maintain shared templates and review configuration.</p>
        </div>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Administrator permissions and backend storage are
          awaiting integration. These settings currently apply
          only to this screen’s frontend session.
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

      <section className="supporting-panel supporting-panel--blue">
        <h2>Default ADR PowerPoint template</h2>

        <p>
          Maintain the blank template here once. The ADR agent
          will use the selected template when integration is ready.
        </p>

        <FileDropZone
          label="Default ADR template — one PPTX file"
          extensions={[".pptx"]}
          onFiles={attachTemplate}
        />

        <p className="workspace-secondary">
          Each new upload becomes the current template.
          Previous versions are retained during this session.
        </p>

        {currentTemplate && (
          <p>
            <strong>Current template:</strong>{" "}
            {currentTemplate.file.name}
            {" · "}Version {currentTemplate.version}
          </p>
        )}

        {[...templates].reverse().map((template) => (
          <div className="supporting-template" key={template.id}>
            <p>
              <strong>Version {template.version}</strong>
              {" · "}
              {template.file.name}
              {template.id === currentTemplate?.id
                ? " · Current"
                : ""}
            </p>

            <Button onClick={() => downloadFile(template.file)}>
              Download template
            </Button>
          </div>
        ))}
      </section>

      <section className="supporting-panel">
        <h2>Responsible AI contact</h2>

        <label className="session-field">
          Designated RAI manager
          <Input
            value={raiManager}
            onChange={(_, data) => setRAIManager(data.value)}
          />
        </label>

        <Button appearance="primary" onClick={saveSettings}>
          Save settings
        </Button>

        <p className="workspace-secondary">
          Saved contact: {savedRAIManager}. Using this setting
          in meetings and assessments will be connected later.
        </p>
      </section>

      <section className="supporting-panel">
        <h2>Integration status</h2>

        <ul>
          <li>IT Intake / Dataverse: awaiting integration.</li>
          <li>Foundry agents: awaiting integration.</li>
          <li>ADR generation: awaiting integration.</li>
          <li>LeanIX submission: awaiting integration.</li>
          <li>Authentication and role enforcement: awaiting integration.</li>
        </ul>
      </section>
    </section>
  );
}