import { ProjectUpdateContext } from "./ProjectUpdates";
import type { ProjectPatch } from "./ProjectUpdates";
import { deriveStage, overdueConditionCount } from "./projectWorkflow";
import { useCallback, useState } from "react";
import type { ReactElement } from "react";
import Reports from "./Reports";
import {
  MyActions,
  Knowledge,
  Administration,
} from "./SupportingWorkspaces";

import {
  Button,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

import {
  ArrowUploadRegular,
  BookOpenRegular,
  ChartMultipleRegular,
  ClipboardTaskListLtrRegular,
  GridRegular,
  SettingsRegular,
} from "@fluentui/react-icons";

import { projects as initialProjects } from "./projectData";
import { matchesPortfolioFilter } from "./portfolioUtils";

import IntakeImport from "./IntakeImport";
import ProjectRegister from "./ProjectRegister";
import ProjectWorkspace from "./ProjectWorkspace";

import type { IntakeDraft } from "./IntakeImport";
import type { PortfolioFilter, Project } from "./types";

type NavigationItem =
  | "Portfolio"
  | "My actions"
  | "Reports"
  | "Knowledge"
  | "Administration";

interface PortfolioSummary {
  filter: Exclude<PortfolioFilter, "all">;
  label: string;
  value: number;
  description: string;
  tone: string;
}

const navigation: {
  name: NavigationItem;
  icon: ReactElement;
}[] = [
    { name: "Portfolio", icon: <GridRegular /> },
    {
      name: "My actions",
      icon: <ClipboardTaskListLtrRegular />,
    },
    { name: "Reports", icon: <ChartMultipleRegular /> },
    { name: "Knowledge", icon: <BookOpenRegular /> },
    { name: "Administration", icon: <SettingsRegular /> },
  ];

function App() {
  const [activePage, setActivePage] =
    useState<NavigationItem>("Portfolio");

  const [projects, setProjects] =
    useState<Project[]>(initialProjects);

  const [portfolioFilter, setPortfolioFilter] =
    useState<PortfolioFilter>("all");

  const [selectedDemandId, setSelectedDemandId] =
    useState<string | null>(null);

  const [openedDemandIds, setOpenedDemandIds] = useState<string[]>([]);

  const updateProject = useCallback((demandId: string, patch: ProjectPatch) => {
    setProjects((current) => current.map((project) => {
      if (project.demandId !== demandId) return project;
      const updated = { ...project, ...patch };
      if (updated.eaStatus !== "Approved" && updated.arbStatus === "Completed") {
        updated.arbStatus = "In progress";
        updated.arbCompletionDate = undefined;
      }
      updated.stage = deriveStage(updated);
      if (
        patch.eaItems !== undefined ||
        patch.securityConditions !== undefined ||
        patch.raiConditions !== undefined
      ) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        updated.overdueActions = overdueConditionCount(updated, today);
      }
      return updated;
    }));
  }, []);

  function openProject(demandId: string) {
    setOpenedDemandIds((current) => current.includes(demandId) ? current : [...current, demandId]);
    setSelectedDemandId(demandId);
  }

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const selectedProject = projects.find(
    (project) => project.demandId === selectedDemandId,
  );

  const overdueProjects = projects.filter((project) =>
    matchesPortfolioFilter(project, "overdue"),
  );

  const summaries: PortfolioSummary[] = [
    {
      filter: "active",
      label: "Active reviews",
      value: projects.filter((project) =>
        matchesPortfolioFilter(project, "active"),
      ).length,
      description: "Projects not yet in production",
      tone: "blue",
    },
    {
      filter: "overdue",
      label: "Overdue actions",
      value: projects.reduce(
        (total, project) => total + project.overdueActions,
        0,
      ),
      description: `Across ${overdueProjects.length} projects`,
      tone: "red",
    },
    {
      filter: "conditional",
      label: "Conditional approvals",
      value: projects.filter((project) =>
        matchesPortfolioFilter(project, "conditional"),
      ).length,
      description: "Projects with conditional review decisions",
      tone: "amber",
    },
    {
      filter: "arbCompleted",
      label: "Completed ARBs",
      value: projects.filter((project) =>
        matchesPortfolioFilter(project, "arbCompleted"),
      ).length,
      description: "Distinct projects · All time",
      tone: "green",
    },
  ];

  function handleIntakeImport(draft: IntakeDraft) {
    const existing = projects.find(
      (project) => project.demandId === draft.demandId,
    );

    const intakeSource = {
      fileName: draft.fileName,
      markdown: draft.markdown,
      importedAt: new Date().toISOString(),
    };

    if (existing) {
      setProjects((current) =>
        current.map((project) =>
          project.demandId === draft.demandId
            ? {
              ...project,
              name: draft.name,
              businessFunction:
                draft.businessFunction ||
                project.businessFunction,
              assignedEA:
                draft.assignedEA || project.assignedEA,
              intakeSource,
            }
            : project,
        ),
      );

      setImportMessage(
        `Intake details updated for #${draft.demandId}. Existing review decisions and actions were preserved.`,
      );
    } else {
      const newProject: Project = {
        demandId: draft.demandId,
        name: draft.name,
        businessFunction:
          draft.businessFunction || "Not provided",
        assignedEA: draft.assignedEA || "Not assigned",
        stage: "Architecture review",
        eaStatus: "Pending",
        securityStatus: "Pending",
        raiStatus: "Pending",
        eaComplexity: "Not assessed",
        securityRisk: "Not assessed",
        raiRisk: "Not assessed",
        nextAction:
          "Review imported intake and confirm review applicability",
        overdueActions: 0,
        arbStatus: "Not scheduled",
        intakeSource,
      };

      setProjects((current) => [newProject, ...current]);

      setImportMessage(
        `Project #${draft.demandId} added. Review applicability, assignments, and classifications need confirmation.`,
      );
    }

    setIntakeOpen(false);
  }

  return (
    <ProjectUpdateContext.Provider value={updateProject}>
      <div className="application">
        <header className="application-header">
          <div className="brand">
            <div className="header-logo-container">
              <img
                src="/DuPont_Logo.png"
                alt="DuPont"
                className="header-logo"
              />
            </div>

            <span className="brand-divider" aria-hidden="true" />

            <span className="application-name">
              Enterprise Guardrail
            </span>
          </div>

          <div className="user-profile">
            <span className="environment-label">
              LOCAL DEVELOPMENT
            </span>

            <div className="user-description">
              <strong>Jatinder Arora</strong>
              <span>Enterprise Architect · Demo identity</span>
            </div>

            <div className="user-avatar" aria-hidden="true">
              JA
            </div>
          </div>
        </header>

        <div className="application-layout">
          <aside className="sidebar">
            <div className="navigation-label">WORKSPACE</div>

            <nav aria-label="Main navigation">
              {navigation.map((item) => (
                <Button
                  key={item.name}
                  appearance="subtle"
                  icon={item.icon}
                  className={`navigation-button ${activePage === item.name ? "is-active" : ""
                    }`}
                  aria-current={
                    activePage === item.name ? "page" : undefined
                  }
                  onClick={() => setActivePage(item.name)}
                >
                  {item.name}
                </Button>
              ))}
            </nav>

            <div className="sidebar-note">
              <strong>Shared visibility</strong>
              <p>
                All application users can view every project.
                Roles control editing and approval actions.
              </p>
            </div>
          </aside>

          <main className="main-content">
            <div className="breadcrumb">
              Workspace / {activePage}
              {activePage === "Portfolio" && selectedProject
                ? ` / Demand #${selectedProject.demandId}`
                : ""}
            </div>

            <>
              <div hidden={activePage !== "Portfolio"}>
                {openedDemandIds.map((demandId) => {
                  const project = projects.find((item) => item.demandId === demandId);
                  return project ? (
                    <div key={demandId} hidden={selectedDemandId !== demandId}>
                      <ProjectWorkspace
                        project={project}
                        onBack={() => setSelectedDemandId(null)}
                      />
                    </div>
                  ) : null;
                })}

                <div hidden={Boolean(selectedProject)}>
                  <div className="page-heading">
                    <div>
                      <h1>Project portfolio</h1>
                      <p>
                        One place for reviews, decisions, and the
                        evidence behind them.
                      </p>
                    </div>

                    <Button
                      appearance="primary"
                      icon={<ArrowUploadRegular />}
                      onClick={() => setIntakeOpen(true)}
                    >
                      Import intake
                    </Button>
                  </div>

                  {importMessage && (
                    <div className="intake-notice">
                      <MessageBar intent="success">
                        <MessageBarBody>
                          {importMessage}
                        </MessageBarBody>
                      </MessageBar>
                    </div>
                  )}

                  <section
                    className="summary-grid"
                    aria-label="Sample portfolio summary"
                  >
                    {summaries.map((summary) => (
                      <button
                        key={summary.filter}
                        type="button"
                        className={`summary-card tone-${summary.tone}`}
                        aria-pressed={
                          portfolioFilter === summary.filter
                        }
                        onClick={() =>
                          setPortfolioFilter((current) =>
                            current === summary.filter
                              ? "all"
                              : summary.filter,
                          )
                        }
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
                      </button>
                    ))}
                  </section>

                  <ProjectRegister
                    projects={projects}
                    portfolioFilter={portfolioFilter}
                    onClearPortfolioFilter={() =>
                      setPortfolioFilter("all")
                    }
                    onSelectProject={openProject}
                  />
                </div>
              </div>
              {activePage === "Reports" && (
                <Reports
                  projects={projects}
                  onOpenProject={(demandId) => {
                    openProject(demandId);
                    setActivePage("Portfolio");
                  }}
                />
              )}
              <div hidden={activePage !== "My actions"}>
                <MyActions
                  projects={projects}
                  onOpenProject={(demandId) => {
                    openProject(demandId);
                    setActivePage("Portfolio");
                  }}
                />
              </div>

              <div hidden={activePage !== "Knowledge"}>
                <Knowledge />
              </div>

              <div hidden={activePage !== "Administration"}>
                <Administration />
              </div>
            </>

            <footer className="page-footer">
              Development preview · Sample project data and
              in-memory imports. Authentication and backend
              services are not connected.
            </footer>

            {intakeOpen && (
              <IntakeImport
                open={intakeOpen}
                existingDemandIds={projects.map(
                  (project) => project.demandId,
                )}
                onClose={() => setIntakeOpen(false)}
                onImport={handleIntakeImport}
              />
            )}
          </main>
        </div>
      </div>
    </ProjectUpdateContext.Provider>
  );
}

export default App;