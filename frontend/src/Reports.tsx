import { useState } from "react";

import {
  Button,
  Select,
} from "@fluentui/react-components";

import type { Project } from "./types";
import { gateIsCurrent } from "./projectWorkflow";

interface ReportsProps {
  projects: Project[];
  onOpenProject: (demandId: string) => void;
}

function gateStatus(project: Project) {
  if (!project.gateRecordedAt) return "Not recorded";

  return gateIsCurrent(project)
    ? project.gateDecision ?? "Not recorded"
    : "Review changed";
}

function csvCell(value: string | number) {
  let text = String(value);

  // Keep spreadsheet applications from interpreting text as formulas.
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export default function Reports({
  projects,
  onOpenProject,
}: ReportsProps) {
  const [businessFunction, setBusinessFunction] =
    useState("All");

  const [assignedEA, setAssignedEA] = useState("All");
  const [stage, setStage] = useState("All");

  const businessFunctions = [
    ...new Set(projects.map((project) => project.businessFunction)),
  ].sort();

  const architects = [
    ...new Set(projects.map((project) => project.assignedEA)),
  ].sort();

  const stages = [
    ...new Set(projects.map((project) => project.stage)),
  ].sort();

  const filteredProjects = projects.filter(
    (project) =>
      (businessFunction === "All" ||
        project.businessFunction === businessFunction) &&
      (assignedEA === "All" ||
        project.assignedEA === assignedEA) &&
      (stage === "All" || project.stage === stage),
  );

  const activeProjects = filteredProjects.filter(
    (project) => project.stage !== "Production",
  ).length;

  const conditionalProjects = filteredProjects.filter(
    (project) =>
      project.eaStatus === "Conditional" ||
      project.securityStatus === "Conditional" ||
      project.raiStatus === "Conditional" ||
      (gateIsCurrent(project) &&
        project.gateDecision === "Conditional approval"),
  ).length;

  const completedARBs = filteredProjects.filter(
    (project) => project.arbStatus === "Completed",
  ).length;

  const overdueActions = filteredProjects.reduce(
    (total, project) => total + project.overdueActions,
    0,
  );

  const summaries = [
    {
      label: "Active projects",
      value: activeProjects,
      description: "Not yet in production",
      tone: "blue",
    },
    {
      label: "Conditional approvals",
      value: conditionalProjects,
      description: "Distinct projects",
      tone: "amber",
    },
    {
      label: "Completed ARBs",
      value: completedARBs,
      description: "Distinct projects · All time",
      tone: "green",
    },
    {
      label: "Overdue actions",
      value: overdueActions,
      description: "Across filtered projects",
      tone: "red",
    },
  ];

  function clearFilters() {
    setBusinessFunction("All");
    setAssignedEA("All");
    setStage("All");
  }

  function exportCSV() {
    const headers = [
      "Demand ID",
      "Project",
      "Business function",
      "Assigned EA",
      "Stage",
      "EA status",
      "EA complexity",
      "Security status",
      "Security risk",
      "RAI status",
      "RAI risk",
      "ARB status",
      "ARB completion date",
      "Production gate",
      "Gate scope",
      "Actual go-live date",
      "LeanIX status",
      "LeanIX ID",
      "LeanIX link",
      "Overdue actions",
    ];

    const rows = filteredProjects.map((project) => [
      project.demandId,
      project.name,
      project.businessFunction,
      project.assignedEA,
      project.stage,
      project.eaStatus,
      project.eaComplexity,
      project.securityStatus,
      project.securityRisk,
      project.raiStatus,
      project.raiStatus === "Not applicable"
        ? "Not applicable"
        : project.raiRisk,
      project.arbStatus,
      project.arbCompletionDate ?? "",
      gateStatus(project),
      project.gateScope ?? "",
      project.goLiveDate ?? "",
      project.leanixStatus ?? "Not recorded",
      project.leanixId ?? "",
      project.leanixUrl ?? "",
      project.overdueActions,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `enterprise-guardrails-report-${
        new Date().toISOString().slice(0, 10)
      }.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="reports-page">
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>
            Review progress, classifications, and production
            registration across projects.
          </p>
        </div>

        <Button
          appearance="primary"
          disabled={filteredProjects.length === 0}
          onClick={exportCSV}
        >
          Export CSV
        </Button>
      </div>

      <section
        className="content-panel reports-filters"
        aria-label="Report filters"
      >
        <label className="session-field">
          Business function
          <Select
            value={businessFunction}
            onChange={(_, data) =>
              setBusinessFunction(data.value)
            }
          >
            <option value="All">All business functions</option>

            {businessFunctions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>

        <label className="session-field">
          Assigned EA
          <Select
            value={assignedEA}
            onChange={(_, data) => setAssignedEA(data.value)}
          >
            <option value="All">All architects</option>

            {architects.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>

        <label className="session-field">
          Project stage
          <Select
            value={stage}
            onChange={(_, data) => setStage(data.value)}
          >
            <option value="All">All stages</option>

            {stages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>

        <Button onClick={clearFilters}>Clear filters</Button>
      </section>

      <section
        className="summary-grid"
        aria-label="Filtered report summary"
      >
        {summaries.map((summary) => (
          <div
            key={summary.label}
            className={`summary-card tone-${summary.tone}`}
          >
            <span className="summary-label">
              {summary.label}
            </span>

            <strong className="summary-value">
              {summary.value}
            </strong>

            <span className="summary-description">
              {summary.description}
            </span>
          </div>
        ))}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <h2>Project review register</h2>

          <span role="status">
            {filteredProjects.length} of {projects.length} projects
          </span>
        </div>

        <div
          className="reports-table-scroll"
          role="region"
          aria-label="Project report table"
          tabIndex={0}
        >
          <table className="reports-table">
            <caption className="reports-caption">
              Summary cards and CSV export use the selected filters.
            </caption>

            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Assigned EA</th>
                <th scope="col">Stage</th>
                <th scope="col">EA</th>
                <th scope="col">Security</th>
                <th scope="col">Responsible AI</th>
                <th scope="col">ARB</th>
                <th scope="col">Production gate</th>
                <th scope="col">LeanIX</th>
                <th scope="col">Overdue</th>
                <th scope="col">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    No projects match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr key={project.demandId}>
                    <td>
                      <strong>{project.name}</strong>
                      <span className="report-detail">
                        #{project.demandId} ·{" "}
                        {project.businessFunction}
                      </span>
                    </td>

                    <td>{project.assignedEA}</td>
                    <td>{project.stage}</td>

                    <td>
                      {project.eaStatus}
                      <span className="report-detail">
                        Complexity: {project.eaComplexity}
                      </span>
                    </td>

                    <td>
                      {project.securityStatus}
                      <span className="report-detail">
                        Risk: {project.securityRisk}
                      </span>
                    </td>

                    <td>
                      {project.raiStatus}
                      {project.raiStatus !== "Not applicable" && (
                        <span className="report-detail">
                          Risk: {project.raiRisk}
                        </span>
                      )}
                    </td>

                    <td>{project.arbStatus}</td>
                    <td>{gateStatus(project)}</td>

                    <td>
                      {project.leanixStatus ?? "Not recorded"}
                      {project.leanixId && (
                        <span className="report-detail">
                          {project.leanixId}
                        </span>
                      )}
                    </td>

                    <td>{project.overdueActions}</td>

                    <td>
                      <Button
                        aria-label={`Open project ${project.demandId}`}
                        onClick={() =>
                          onOpenProject(project.demandId)
                        }
                      >
                        Open project
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="workspace-secondary">
        Reports reflect the current frontend session. Overdue counts
        use the shared project totals; conditions entered only as
        free-text comments are not counted automatically.
      </p>
    </section>
  );
}