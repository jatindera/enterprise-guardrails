import { ProjectUpdateContext } from "./ProjectUpdates";
import type { ProjectPatch } from "./ProjectUpdates";
import { deriveStage, overdueConditionCount } from "./projectWorkflow";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { getProject, importProject, listProjects, projectFromApi, updateRAIAssignment } from "./api/projects";
import { matchesPortfolioFilter } from "./portfolioUtils";

import IntakeImport from "./IntakeImport";
import ProjectRegister from "./ProjectRegister";
import ProjectWorkspace from "./ProjectWorkspace";

import type { IntakeDraft } from "./IntakeImport";
import type { PortfolioFilter, Project } from "./types";
import BackendStatus from "./BackendStatus";

import { useAuth } from "./auth/AuthGate";
import ProfileMenu from "./auth/ProfileMenu";

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
  const user = useAuth();
  const isAdmin = user.roles.includes("Admin");
  const [activePage, setActivePage] =
    useState<NavigationItem>("Portfolio");

  const [projects, setProjects] =
    useState<Project[]>([]);

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

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [opening, setOpening] = useState(false);
  const loadSequence = useRef(0);
  const openSequence = useRef(0);

  const refreshProjects = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const records = await listProjects(signal);
      if (signal?.aborted || sequence !== loadSequence.current) return;
      setProjects((current) => records.map((record) =>
        projectFromApi(record, current.find((item) => item.demandId === record.demandId)),
      ));
    } catch (cause) {
      if (signal?.aborted || sequence !== loadSequence.current) return;
      setLoadError(cause instanceof Error ? cause.message : "Could not load projects.");
    } finally {
      if (!signal?.aborted && sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshProjects(controller.signal);
    return () => controller.abort();
  }, [refreshProjects]);

  async function openProject(demandId: string) {
    const sequence = ++openSequence.current;
    setOpening(true);
    setLoadError("");
    try {
      const record = await getProject(demandId);
      if (sequence !== openSequence.current) return;
      setProjects((current) => {
        const existing = current.find((item) => item.demandId === demandId);
        const updated = projectFromApi(record, existing);
        return existing
          ? current.map((item) => item.demandId === demandId ? updated : item)
          : [updated, ...current];
      });
      setOpenedDemandIds((current) => current.includes(demandId) ? current : [...current, demandId]);
      setSelectedDemandId(demandId);
    } catch (cause) {
      if (sequence === openSequence.current) {
        setLoadError(cause instanceof Error ? cause.message : "Could not open project.");
      }
    } finally {
      if (sequence === openSequence.current) setOpening(false);
    }
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

  async function handleIntakeImport(draft: IntakeDraft): Promise<void> {
    if (!isAdmin) throw new Error("Administrator access is required.");
    const record = await importProject(draft);
    setProjects((current) => {
      const existing = current.find((item) => item.demandId === record.demandId);
      const updated = projectFromApi(record, existing);
      return existing
        ? current.map((item) => item.demandId === record.demandId ? updated : item)
        : [updated, ...current];
    });
    setImportMessage(`Project #${record.demandId} and its intake snapshot saved to Azure SQL.`);
    setIntakeOpen(false);
  }

  async function saveRAIAssignment(demandId: string, name: string, expectedRevision: number): Promise<void> {
    if (!isAdmin) throw new Error("Administrator access is required.");
    const record = await updateRAIAssignment(demandId, name, expectedRevision);
    setProjects((current) => current.map((project) => project.demandId === record.demandId
      ? projectFromApi(record, project) : project));
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
            <BackendStatus />
            <span className="environment-label">
              LOCAL DEVELOPMENT
            </span>

            <div className="user-description">
              <strong>{user.name}</strong>
              <span>{user.roles.join(" · ")}</span>
            </div>

            <ProfileMenu />
          </div>
        </header>

        <div className="application-layout">
          <aside className="sidebar">
            <div className="navigation-label">WORKSPACE</div>

            <nav aria-label="Main navigation">
              {navigation.filter((item) => isAdmin || item.name !== "Administration").map((item) => (
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

            {loadError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {loadError}
                  <Button disabled={loading} onClick={() => void refreshProjects()}>
                    Reload portfolio
                  </Button>
                </MessageBarBody>
              </MessageBar>
            )}
            {opening && <p role="status">Opening project…</p>}

            <>
              <div hidden={activePage !== "Portfolio"}>
                {openedDemandIds.map((demandId) => {
                  const project = projects.find((item) => item.demandId === demandId);
                  return project ? (
                    <div key={demandId} hidden={selectedDemandId !== demandId}>
                      <ProjectWorkspace
                        project={project}
                        onSaveRAIAssignment={saveRAIAssignment}
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
                      disabled={loading || !isAdmin}
                      title={isAdmin ? "Import intake" : "Administrator access is required"}
                      onClick={() => setIntakeOpen(true)}
                    >
                      Import intake
                    </Button>
                  </div>

                  <div className="meeting-review-actions">
                    <Button disabled={loading} onClick={() => void refreshProjects()}>
                      {loading ? "Loading projects…" : "Reload portfolio"}
                    </Button>
                  </div>
                  {!loading && !loadError && projects.length === 0 && (
                    <MessageBar intent="info">
                      <MessageBarBody>No projects in Azure SQL yet. Import an intake Markdown file to begin.</MessageBarBody>
                    </MessageBar>
                  )}

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
                    aria-label="Portfolio summary"
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
                {isAdmin && <Administration />}
              </div>
            </>

            <footer className="page-footer">
              Development preview · Project details and intake snapshots use Azure SQL.
              Review decisions, files, and settings remain in memory. Entra SSO is connected.
              Assessment edit permissions will be connected in a later increment.
            </footer>

            {intakeOpen && isAdmin && (
              <IntakeImport
                open={intakeOpen}
                existingDemandIds={projects.map(
                  (project) => project.demandId,
                )}
                existingProjectRevisions={Object.fromEntries(
                  projects.flatMap((project) => project.revision !== undefined
                    ? [[project.demandId, project.revision]] : []),
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