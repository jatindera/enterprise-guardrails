import { useProjectUpdate } from "./ProjectUpdates";
import { useState } from "react";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Select,
  Textarea,
} from "@fluentui/react-components";

import type { Project } from "./types";
import type { CurrentDiagramReference } from "./ArchitectureDiagrams";

type EAComplexity = "Low" | "Medium" | "High";
type EADecision = "Approved" | "On hold" | "Rejected";

interface ReportItem {
  id: string;
  description: string;
  comments: string;
  status: "Open" | "Closed";
}

interface EAApprovalReportProps {
  project: Project;
  items: ReportItem[];
  currentDiagram: CurrentDiagramReference | null;
}

interface ReportSnapshot {
  id: string;
  version: number;
  createdAt: string;
  projectName: string;
  demandId: Project["demandId"];
  assignedEA: string;
  summary: string;
  complexity: EAComplexity;
  decision: EADecision;
  comments: string;
  items: ReportItem[];
  diagram: CurrentDiagramReference | null;
}

export default function EAApprovalReport({
  project,
  items,
  currentDiagram,
}: EAApprovalReportProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const [summary, setSummary] = useState("");
  const [complexity, setComplexity] =
    useState<EAComplexity | "">(
      project.eaComplexity === "Not assessed"
        ? ""
        : project.eaComplexity
    );

  const [decision, setDecision] =
    useState<EADecision | "">("");

  const [comments, setComments] = useState("");
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [error, setError] = useState("");

  const openCount = items.filter(
    (item) => item.status === "Open"
  ).length;

  function saveReport() {
    if (!summary.trim() || !complexity || !decision) {
      setError("Enter a summary, complexity, and decision.");
      return;
    }

    if (items.some((item) => !item.description.trim())) {
      setError("Complete the descriptions of existing EA items.");
      return;
    }

    if (decision === "Approved" && !currentDiagram) {
      setError("Mark an architecture diagram as current before approval.");
      return;
    }

    if (
      (decision !== "Approved" || openCount > 0) &&
      !comments.trim()
    ) {
      setError(
        "Explain the decision and how any outstanding items are being handled."
      );
      return;
    }

    const report: ReportSnapshot = {
      id: crypto.randomUUID(),
      version: reports.length + 1,
      createdAt: new Date().toISOString(),
      projectName: project.name,
      demandId: project.demandId,
      assignedEA: project.assignedEA,
      summary: summary.trim(),
      complexity,
      decision,
      comments: comments.trim(),
      items: items.map((item) => ({ ...item })),
      diagram: currentDiagram ? { ...currentDiagram } : null,
    };

    updateProject({ eaStatus: decision, eaComplexity: complexity });
    setReports((current) => [...current, report]);
    setError("");
  }

  function reportMarkdown(report: ReportSnapshot) {
    const itemText = report.items.length
      ? report.items
          .map(
            (item, index) =>
              `### EA-${index + 1} — ${item.status}\n\n` +
              `${item.description}\n\n` +
              `EA comments: ${item.comments || "None"}`
          )
          .join("\n\n")
      : "No EA items recorded.";

    const diagramText = report.diagram
      ? [
          `Version: ${report.diagram.version}`,
          `File: ${report.diagram.fileName}`,
          `Diagram ID: ${report.diagram.id}`,
          `Description: ${report.diagram.description}`,
        ].join("\n\n")
      : "No diagram referenced.";

    return [
      "# EA assessment report",
      "**LOCAL PROTOTYPE — NOT AN AUTHENTICATED APPROVAL**",
      `Report version: ${report.version}`,
      `Report ID: ${report.id}`,
      `Created: ${report.createdAt}`,
      `Project: ${report.projectName}`,
      `Demand ID: ${report.demandId}`,
      `Assigned EA: ${report.assignedEA}`,
      `EA complexity: ${report.complexity}`,
      `Recorded decision: ${report.decision}`,
      "## Assessment summary",
      report.summary,
      "## Decision comments",
      report.comments || "None",
      "## Diagram reviewed",
      diagramText,
      "## EA requirements & pending items",
      itemText,
      "## Scope",
      "This EA record does not grant Security, Responsible AI, ARB, or production-gate approval. Risk exceptions require Security authorization.",
      "The diagram file is a separate artifact and is not embedded in this report.",
    ].join("\n\n");
  }

  function downloadReport(report: ReportSnapshot) {
    const blob = new Blob([reportMarkdown(report)], {
      type: "text/markdown;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `${report.demandId}-EA-report-v${report.version}.md`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="content-panel ea-approval-report">
      <div className="panel-heading">
        <h2>EA report & decision</h2>

        <Badge appearance="tint" color="warning">
          Local prototype
        </Badge>
      </div>

      <div className="workspace-panel-body">
        <MessageBar intent="info">
          <MessageBarBody>
            Save a report snapshot and update the frontend portfolio.
            This does not update Intake or authenticate the approver.
            Records remain available during this app session and clear
            on refresh.
          </MessageBarBody>
        </MessageBar>

        <div className="ea-report-readiness">
          <p>
            <strong>Assigned EA:</strong> {project.assignedEA}
          </p>

          <p>
            <strong>EA items:</strong> {openCount} open
            {" · "}
            {items.length - openCount} closed
          </p>

          <p>
            <strong>Current diagram:</strong>{" "}
            {currentDiagram
              ? `Version ${currentDiagram.version} — ${currentDiagram.fileName}`
              : "None selected"}
          </p>

          <p className="workspace-secondary">
            These counts support review; they do not verify
            that requirements have been implemented.
          </p>
        </div>

        <label className="session-field">
          Assessment summary
          <Textarea
            value={summary}
            rows={5}
            placeholder="Summarize the architecture, scope, key decisions, and EA conclusions…"
            onChange={(_, data) => setSummary(data.value)}
          />
        </label>

        <label className="session-field">
          EA complexity
          <Select
            value={complexity}
            onChange={(_, data) =>
              setComplexity(data.value as EAComplexity | "")
            }
          >
            <option value="">Select complexity</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </Select>
        </label>

        <p className="workspace-secondary">
          EA complexity describes solution complexity, not
          Security or Responsible AI risk.
        </p>

        <label className="session-field">
          EA decision
          <Select
            value={decision}
            onChange={(_, data) =>
              setDecision(data.value as EADecision | "")
            }
          >
            <option value="">Select decision</option>
            <option value="Approved">Approved</option>
            <option value="On hold">On hold</option>
            <option value="Rejected">Rejected</option>
          </Select>
        </label>

        <label className="session-field">
          Decision comments
          <Textarea
            value={comments}
            rows={4}
            placeholder="Explain the decision, outstanding work, and any separately authorized exceptions…"
            onChange={(_, data) => setComments(data.value)}
          />
        </label>

        <Button appearance="primary" onClick={saveReport}>
          Save local report snapshot
        </Button>

        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}

        <p className="workspace-secondary" role="status">
          {reports.length} report snapshots saved locally.
        </p>

        {[...reports].reverse().map((report) => (
          <article className="ea-record" key={report.id}>
            <h3>
              Report version {report.version}
              {" · "}
              {report.decision}
            </h3>

            <p className="workspace-secondary">
              {new Date(report.createdAt).toLocaleString()}
              {" · "}
              Diagram:{" "}
              {report.diagram
                ? `Version ${report.diagram.version}`
                : "None"}
            </p>

            <details>
              <summary>Preview report</summary>
              <pre className="intake-source-text">
                {reportMarkdown(report)}
              </pre>
            </details>

            <div className="meeting-review-actions">
              <a href="#" onClick={(event) => { event.preventDefault(); downloadReport(report); }}>
                Download report (.md)
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
