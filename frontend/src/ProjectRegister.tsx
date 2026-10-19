import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
} from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";

import type {
  PortfolioFilter,
  Project,
  ReviewStatus,
} from "./types";

import {
  matchesPortfolioFilter,
  portfolioFilterLabels,
} from "./portfolioUtils";

interface ProjectRegisterProps {
  projects: Project[];
  portfolioFilter: PortfolioFilter;
  onClearPortfolioFilter: () => void;
  onSelectProject: (demandId: string) => void;
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const color =
    status === "Approved"
      ? "success"
      : status === "Conditional"
        ? "warning"
        : status === "In progress"
          ? "brand"
          : "informative";

  return (
    <Badge appearance="tint" color={color}>
      {status}
    </Badge>
  );
}

export default function ProjectRegister({
  projects,
  portfolioFilter,
  onClearPortfolioFilter,
  onSelectProject,
}: ProjectRegisterProps) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [stage, setStage] = useState("All stages");
  
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesSearch =
        !query ||
        `${project.demandId} ${project.name}`
          .toLowerCase()
          .includes(query);

      const matchesScope =
        scope === "all" ||
        project.assignedEA === "Jatinder Arora";

      const matchesStage =
        stage === "All stages" || project.stage === stage;

      return (
        matchesSearch &&
        matchesScope &&
        matchesStage &&
        matchesPortfolioFilter(project, portfolioFilter)
      );
    });
  }, [projects, search, scope, stage, portfolioFilter]);

  const hasFilters =
    search !== "" ||
    scope !== "all" ||
    stage !== "All stages" ||
    portfolioFilter !== "all";

  function resetFilters() {
    setSearch("");
    setScope("all");
    setStage("All stages");
    onClearPortfolioFilter();
  }

  return (
    <>
      <section
        className="content-panel"
        aria-labelledby="project-register-heading"
      >
        <div className="panel-heading">
          <h2 id="project-register-heading">
            Project register
          </h2>

          <span className="sample-label">
            Illustrative data · All reviews required for #3601
          </span>
        </div>

        <div className="register-toolbar">
          <div
            className="register-scope"
            aria-label="Project scope"
          >
            <Button
              appearance={
                scope === "all" ? "primary" : "secondary"
              }
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All projects
            </Button>

            <Button
              appearance={
                scope === "mine" ? "primary" : "secondary"
              }
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              My projects
            </Button>
          </div>

          <Input
            className="register-search"
            contentBefore={<SearchRegular />}
            aria-label="Search by Demand ID or project name"
            placeholder="Search Demand ID or project name"
            value={search}
            onChange={(_, data) => setSearch(data.value)}
          />

          <Select
            aria-label="Filter by lifecycle stage"
            value={stage}
            onChange={(_, data) => setStage(data.value)}
          >
            <option>All stages</option>
            <option>Architecture review</option>
            <option>Security &amp; RAI</option>
            <option>Stage gate</option>
            <option>Production</option>
          </Select>

          {hasFilters && (
            <Button
              appearance="subtle"
              onClick={resetFilters}
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="register-table-container">
          <table className="register-table">
            <thead>
              <tr>
                <th scope="col">Project / Assigned EA</th>
                <th scope="col">Review status</th>
                <th scope="col">Complexity / Risk</th>
                <th scope="col">Next action</th>
              </tr>
            </thead>

            <tbody>
              {filteredProjects.map((project) => (
                <tr key={project.demandId}>
                  <td>
                    <button
                      type="button"
                      className="project-name-button"
                      onClick={() => onSelectProject(project.demandId)}
                    >
                      {project.name}
                    </button>

                    <span className="register-secondary">
                      #{project.demandId} ·{" "}
                      {project.businessFunction}
                    </span>

                    <span className="register-secondary">
                      {project.assignedEA}
                    </span>
                  </td>

                  <td>
                    <div className="review-status-row">
                      <span>EA</span>
                      <StatusBadge status={project.eaStatus} />
                    </div>

                    <div className="review-status-row">
                      <span>Security</span>
                      <StatusBadge
                        status={project.securityStatus}
                      />
                    </div>

                    <div className="review-status-row">
                      <span>RAI</span>
                      <StatusBadge status={project.raiStatus} />
                    </div>
                  </td>

                  <td>
                    <div className="rating-row">
                      <span>EA</span>
                      {project.eaComplexity}
                    </div>

                    <div className="rating-row">
                      <span>Security</span>
                      {project.securityRisk}
                    </div>

                    <div className="rating-row">
                      <span>RAI</span>
                      {project.raiRisk}
                    </div>
                  </td>

                  <td>
                    <div>{project.nextAction}</div>

                    <span className="register-secondary">
                      {project.stage}
                    </span>

                    {project.overdueActions > 0 && (
                      <div className="overdue-badge">
                        <Badge
                          appearance="tint"
                          color="danger"
                        >
                          {project.overdueActions} overdue{" "}
                          {project.overdueActions === 1
                            ? "action"
                            : "actions"}
                        </Badge>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {filteredProjects.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="register-no-results"
                  >
                    No projects match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="register-footer">
          <span role="status">
            Showing {filteredProjects.length} of{" "}
            {projects.length} projects
            {portfolioFilter !== "all" &&
              ` · ${portfolioFilterLabels[portfolioFilter]}`}
          </span>

          <span>EA: complexity · Security / RAI: risk</span>
        </div>
      </section>

      
    </>
  );
}