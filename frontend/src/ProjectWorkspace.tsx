import { gateIsCurrent } from "./projectWorkflow";
import { useState } from "react";

import {
  Badge,
  Button,
} from "@fluentui/react-components";

import { ArrowLeftRegular } from "@fluentui/react-icons";

import type {
  AcceptedMeetingReview,
  Project,
} from "./types";

import ReviewSession from "./ReviewSession";
import EAAssessment from "./EAAssessment";
import SecurityRecord from "./SecurityRecord";
import RAIAssessment from "./RAIAssessment";
import ARBReview from "./ARBReview";
import ProductionGate from "./ProductionGate";
import ProductionRecord from "./ProductionRecord";

interface ProjectWorkspaceProps {
  project: Project;
  onBack: () => void;
}

type WorkspaceSection =
  | "Overview"
  | "Review session"
  | "EA assessment"
  | "Security record"
  | "RAI assessment"
  | "ARB review"
  | "Production gate"
  | "Production & LeanIX";

const sections: WorkspaceSection[] = [
  "Overview",
  "Review session",
  "EA assessment",
  "Security record",
  "RAI assessment",
  "ARB review",
  "Production gate",
  "Production & LeanIX",
];

// Reset workspace state when a different project is opened.
export default function ProjectWorkspace({
  project,
  onBack,
}: ProjectWorkspaceProps) {
  return (
    <ProjectWorkspaceContent
      key={project.demandId}
      project={project}
      onBack={onBack}
    />
  );
}

function ProjectWorkspaceContent({
  project,
  onBack,
}: ProjectWorkspaceProps) {
  const [section, setSection] =
    useState<WorkspaceSection>("Overview");

  const [showIntake, setShowIntake] = useState(false);

  const [acceptedReview, setAcceptedReview] =
    useState<AcceptedMeetingReview | null>(null);

  const arbRequired = project.arbStatus !== "Not applicable";

  function reviewCardClass(targetSection: WorkspaceSection) {
    return [
      "workspace-stage",
      "review-stage-card",
      section === targetSection
        ? "review-stage-card--selected"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className="project-workspace">
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={onBack}
      >
        Back to portfolio
      </Button>

      <div className="workspace-heading">
        <div>
          <div className="workspace-tags">
            <Badge appearance="tint" color="brand">
              Demand #{project.demandId}
            </Badge>

            <Badge appearance="tint" color="informative">
              {project.businessFunction}
            </Badge>
          </div>

          <h1>{project.name}</h1>

          <p>Assigned EA: {project.assignedEA}</p>
        </div>

        <div className="workspace-heading-actions">
          <Button
            onClick={() => setShowIntake((value) => !value)}
            aria-expanded={showIntake}
            aria-controls="workspace-original-intake"
          >
            {showIntake ? "Hide intake" : "View intake"}
          </Button>

          <Button
            appearance="primary"
            onClick={() => setSection("Review session")}
          >
            Open review session
          </Button>
        </div>
      </div>

      {showIntake && (
        <section
          id="workspace-original-intake"
          className="content-panel workspace-intake"
          aria-label="Original intake"
        >
          <div className="panel-heading">
            <h2>Original IT Intake</h2>
          </div>

          <div className="workspace-panel-body">
            {project.intakeSource ? (
              <>
                <p className="workspace-secondary">
                  Source: {project.intakeSource.fileName}
                  {" · "}
                  Imported:{" "}
                  {new Date(
                    project.intakeSource.importedAt,
                  ).toLocaleString()}
                </p>

                <pre className="intake-source-text">
                  {project.intakeSource.markdown}
                </pre>
              </>
            ) : (
              <p className="workspace-secondary">
                No original intake file is attached to this
                project. Import a Markdown export to retain it
                here.
              </p>
            )}
          </div>
        </section>
      )}

      <section
        className="workspace-stages"
        aria-label="Review stages"
      >
        <button
          type="button"
          className={reviewCardClass("EA assessment")}
          aria-pressed={section === "EA assessment"}
          onClick={() => setSection("EA assessment")}
        >
          <strong>EA review</strong>
          <span>{project.eaStatus}</span>
        </button>

        <button
          type="button"
          className={reviewCardClass("Security record")}
          aria-pressed={section === "Security record"}
          onClick={() => setSection("Security record")}
        >
          <strong>Security</strong>
          <span>{project.securityStatus}</span>
        </button>

        <button
          type="button"
          className={reviewCardClass("RAI assessment")}
          aria-pressed={section === "RAI assessment"}
          onClick={() => setSection("RAI assessment")}
        >
          <strong>Responsible AI</strong>
          <span>{project.raiStatus}</span>
        </button>

        <button
          type="button"
          className={reviewCardClass("ARB review")}
          aria-pressed={section === "ARB review"}
          disabled={!arbRequired}
          onClick={() => setSection("ARB review")}
        >
          <strong>ARB</strong>
          <span>{project.arbStatus}</span>
        </button>

        <button
          type="button"
          className={reviewCardClass("Production gate")}
          aria-pressed={section === "Production gate"}
          onClick={() => setSection("Production gate")}
        >
          <strong>Production gate</strong>
          <span>{project.gateRecordedAt && !gateIsCurrent(project)
              ? "Review changed — recheck"
              : project.gateDecision ?? "Not recorded"}</span>
        </button>
      </section>

      <p className="workspace-stage-note">
        Review stages have independent decisions. RAI participates
        across discussions. Production deployment and LeanIX
        registration are recorded separately.
      </p>

      <nav
        className="workspace-navigation"
        aria-label="Project sections"
      >
        {sections.map((item) => (
          <Button
            key={item}
            appearance={
              section === item ? "primary" : "subtle"
            }
            aria-pressed={section === item}
            disabled={
              item === "ARB review" && !arbRequired
            }
            onClick={() => setSection(item)}
          >
            {item}
          </Button>
        ))}
      </nav>

      {section === "Overview" && (
        <div className="workspace-overview-grid">
          <section className="content-panel">
            <div className="panel-heading">
              <h2>Project overview</h2>
            </div>

            <div className="workspace-panel-body">
              <dl className="workspace-facts">
                <div>
                  <dt>Demand ID</dt>
                  <dd>{project.demandId}</dd>
                </div>

                <div>
                  <dt>Business function</dt>
                  <dd>{project.businessFunction}</dd>
                </div>

                <div>
                  <dt>Assigned EA</dt>
                  <dd>{project.assignedEA}</dd>
                </div>

                <div>
                  <dt>Current stage</dt>
                  <dd>{project.stage}</dd>
                </div>

                <div>
                  <dt>Next action</dt>
                  <dd>{project.nextAction}</dd>
                </div>

                <div>
                  <dt>Overdue actions</dt>
                  <dd>{project.overdueActions}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="content-panel">
            <div className="panel-heading">
              <h2>Classification</h2>
            </div>

            <div className="workspace-panel-body">
              <dl className="workspace-facts single-column">
                <div>
                  <dt>EA complexity</dt>
                  <dd>{project.eaComplexity}</dd>
                </div>

                <div>
                  <dt>Security risk</dt>
                  <dd>{project.securityRisk}</dd>
                </div>

                <div>
                  <dt>RAI risk</dt>
                  <dd>
                    {project.raiStatus === "Not applicable"
                      ? "Not applicable"
                      : project.raiRisk}
                  </dd>
                </div>
              </dl>

              <p className="workspace-secondary">
                EA measures complexity. Security and RAI
                assess their respective risks.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Keep screens mounted to preserve state across tabs. */}
      <div hidden={section !== "Review session"}>
        <ReviewSession
          project={project}
          onAcceptedReviewChange={setAcceptedReview}
        />
      </div>

      <div hidden={section !== "EA assessment"}>
        <EAAssessment
          project={project}
          acceptedReview={acceptedReview}
          onOpenReviewSession={() =>
            setSection("Review session")
          }
        />
      </div>

      <div hidden={section !== "Security record"}>
        <SecurityRecord project={project} />
      </div>

      <div hidden={section !== "RAI assessment"}>
        <RAIAssessment project={project} />
      </div>

      <div hidden={section !== "ARB review"}>
        {arbRequired && <ARBReview project={project} />}
      </div>

      <div hidden={section !== "Production gate"}>
        <ProductionGate project={project} />
      </div>

      <div hidden={section !== "Production & LeanIX"}>
        <ProductionRecord project={project} />
      </div>
    </div>
  );
}