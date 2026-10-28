import { gateIsCurrent, reviewSignature } from "./projectWorkflow";
import { useProjectUpdate } from "./ProjectUpdates";
import { useEffect, useState } from "react";

import {
  Badge,
  Button,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Textarea,
} from "@fluentui/react-components";

import FileDropZone from "./FileDropZone";
import type { Project } from "./types";

type GateDecision =
  | "Approved"
  | "Conditional approval"
  | "On hold"
  | "Rejected"
  | "Not applicable";

interface GateScope {
  label: string;
  reason: string;
  applicable: boolean;
  assessed: boolean;
}

interface GateEvidence {
  id: string;
  file: File;
  addedAt: string;
}

interface GateRecord {
  id: string;
  recordedAt: string;
  scope: GateScope;
  eaComplexity: Project["eaComplexity"];
  securityRisk: Project["securityRisk"];
  raiRisk: Project["raiRisk"];
  raiApplicable: boolean;
  decision: GateDecision;
  comments: string;
  reviewers: {
    ea: string;
    security: string;
    rai: string;
  };
  jointConfirmed: boolean;
  evidence: {
    id: string;
    fileName: string;
  }[];
}

interface ProductionGateProps {
  project: Project;
}

function determineScope(project: Project): GateScope {
  const raiApplicable = project.raiStatus !== "Not applicable";

  const missingAssessment =
    project.eaComplexity === "Not assessed" ||
    project.securityRisk === "Not assessed" ||
    (raiApplicable && project.raiRisk === "Not assessed");

  if (missingAssessment) {
    return {
      label: "Awaiting classification",
      reason:
        "All applicable classifications are Low. The suggested scope is Exempt; reviewers may record any decision.",
      applicable: true,
      assessed: false,
    };
  }

  const highEA = project.eaComplexity === "High";
  const highSecurity = project.securityRisk === "High";
  const highRAI = raiApplicable && project.raiRisk === "High";

  if (highEA && highSecurity && highRAI) {
    return {
      label: "Full review",
      reason:
        "EA complexity, Security risk, and RAI risk are all High.",
      applicable: true,
      assessed: true,
    };
  }

  if (highSecurity && highRAI) {
    return {
      label: "Focused review — Security and RAI",
      reason:
        "Review the implementation of controls addressing both High-risk domains.",
      applicable: true,
      assessed: true,
    };
  }

  if (highSecurity || highRAI) {
    return {
      label: highSecurity
        ? "Focused review — Security"
        : "Focused review — RAI",
      reason:
        "Focus on the domain rated High and its relevant implementation evidence.",
      applicable: true,
      assessed: true,
    };
  }

  const hasMediumRating =
    project.eaComplexity === "Medium" ||
    project.securityRisk === "Medium" ||
    (raiApplicable && project.raiRisk === "Medium");

  if (highEA || hasMediumRating) {
    return {
      label: "Limited review",
      reason:
        "Perform proportionate implementation checks for architecture complexity and applicable risks.",
      applicable: true,
      assessed: true,
    };
  }

  return {
    label: "Exempt",
    reason:
      "EA complexity and all applicable risk ratings are Low. Record Not applicable for the production gate.",
    applicable: false,
    assessed: true,
  };
}

export default function ProductionGate({
  project,
}: ProductionGateProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const scope = determineScope(project);
  const raiApplicable = project.raiStatus !== "Not applicable";

  const [eaReviewer, setEAReviewer] = useState(
    project.assignedEA ?? "",
  );
  const [securityReviewer, setSecurityReviewer] = useState("");
  const [raiReviewer, setRAIReviewer] = useState("");

  const [decision, setDecision] = useState<GateDecision | "">("");
  const [comments, setComments] = useState("");
  const [jointConfirmed, setJointConfirmed] = useState(false);

  const [evidence, setEvidence] = useState<GateEvidence[]>([]);
  const [records, setRecords] = useState<GateRecord[]>([]);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const latestRecord = records[records.length - 1];
  const currentReviewSignature = reviewSignature(project);

  useEffect(() => {
    setJointConfirmed(false);
  }, [currentReviewSignature]);

  function markChanged() {
    setJointConfirmed(false);
    setError("");
    setMessage("");
  }

  function attachFiles(files: File[]) {
    if (files.length === 0) return;

    const addedAt = new Date().toISOString();

    setEvidence((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        addedAt,
      })),
    ]);

    setJointConfirmed(false);
    setError("");
    setMessage(
      `${files.length} supporting document${files.length === 1 ? "" : "s"
      } added.`,
    );
  }

  function downloadEvidence(item: GateEvidence) {
    const url = URL.createObjectURL(item.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = item.file.name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveDecision() {
    setError("");
    setMessage("");

    if (!decision) {
      setError("Select a decision.");
      return;
    }

    if (
      !eaReviewer.trim() ||
      !securityReviewer.trim() ||
      (raiApplicable && !raiReviewer.trim())
    ) {
      setError("Enter all applicable reviewer names.");
      return;
    }

    if (!comments.trim()) {
      setError("Enter the decision rationale and review comments.");
      return;
    }

    const permitsProduction =
      decision === "Approved" ||
      decision === "Conditional approval";

    if (permitsProduction && evidence.length === 0) {
      setError(
        "Upload supporting implementation evidence before recording approval or conditional approval.",
      );
      return;
    }

    if (!jointConfirmed) {
      setError(
        "Confirm that all applicable reviewers agreed to the decision.",
      );
      return;
    }

    const record: GateRecord = {
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      scope: { ...scope },
      eaComplexity: project.eaComplexity,
      securityRisk: project.securityRisk,
      raiRisk: project.raiRisk,
      raiApplicable,
      decision,
      comments: comments.trim(),
      reviewers: {
        ea: eaReviewer.trim(),
        security: securityReviewer.trim(),
        rai: raiApplicable ? raiReviewer.trim() : "",
      },
      jointConfirmed,
      evidence: evidence.map((item) => ({
        id: item.id,
        fileName: item.file.name,
      })),
    };

    updateProject({
      gateDecision: decision,
      gateScope: scope.label,
      gateRecordedAt: record.recordedAt,
      gateReviewSignature: reviewSignature(project),
    });
    setRecords((current) => [...current, record]);
    setMessage(
      "Decision recorded in this workspace. Backend persistence is pending.",
    );
  }

  return (
    <section className="production-gate">
      <div className="session-heading">
        <div>
          <h3 className="session-subheading">
            Pre-Production Gate
          </h3>

          <p>
            {project.name} · Demand {project.demandId}
          </p>
        </div>

        <Badge appearance="tint" color="brand">
          {project.gateRecordedAt && !gateIsCurrent(project)
            ? "Review changed — re-record decision"
            : latestRecord?.decision ?? project.gateDecision ?? "Not recorded"}
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Record the joint decision and attach supporting documents.
          Files and decisions are currently held in this workspace
          only.
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

      <section className="workspace-content-panel gate-section">
        <div className="session-heading">
          <h3 className="session-subheading">Joint decision</h3>

          <Badge appearance="tint" color="informative">
            {scope.label}
          </Badge>
        </div>

        <p className="workspace-secondary">{scope.reason}</p>

        <label className="session-field">
          EA reviewer
          <Input
            value={eaReviewer}
            onChange={(_, data) => {
              setEAReviewer(data.value);
              markChanged();
            }}
          />
        </label>

        <label className="session-field">
          Security reviewer
          <Input
            value={securityReviewer}
            onChange={(_, data) => {
              setSecurityReviewer(data.value);
              markChanged();
            }}
          />
        </label>

        {raiApplicable && (
          <label className="session-field">
            RAI reviewer
            <Input
              value={raiReviewer}
              onChange={(_, data) => {
                setRAIReviewer(data.value);
                markChanged();
              }}
            />
          </label>
        )}

        <label className="session-field">
          Decision
          <Select
            value={decision}
            onChange={(_, data) => {
              setDecision(data.value as GateDecision | "");
              markChanged();
            }}
          >
            <option value="">Select a decision</option>
            <option value="Approved">Approved</option>
            <option value="Conditional approval">
              Conditional approval
            </option>
            <option value="On hold">On hold</option>
            <option value="Rejected">Rejected</option>
            <option value="Not applicable">Not applicable</option>
          </Select>
        </label>

        <label className="session-field">
          Decision rationale and review comments
          <Textarea
            value={comments}
            rows={5}
            placeholder="Record what was verified, the rationale, and any outstanding conditions with their owners and due dates."
            onChange={(_, data) => {
              setComments(data.value);
              markChanged();
            }}
          />
        </label>

        <FileDropZone
          label="Supporting documents"
          extensions={[
            ".pdf",
            ".docx",
            ".pptx",
            ".txt",
            ".md",
            ".csv",
            ".json",
            ".png",
            ".jpg",
            ".jpeg",
          ]}
          onFiles={attachFiles}
        />

        {evidence.length > 0 && (
          <div className="gate-evidence-list">
            {evidence.map((item) => (
              <article
                key={item.id}
                className="prepared-question"
              >
                <strong>{item.file.name}</strong>

                <p className="workspace-secondary">
                  Added {new Date(item.addedAt).toLocaleString()}
                </p>

                <Button onClick={() => downloadEvidence(item)}>
                  Download
                </Button>
              </article>
            ))}
          </div>
        )}

        <Checkbox
          checked={jointConfirmed}
          label="I confirm that all applicable reviewers agreed to this decision."
          onChange={(_, data) => {
            setJointConfirmed(data.checked === true);
            setError("");
            setMessage("");
          }}
        />

        <p className="workspace-secondary">
          Conditional approval can permit production. Record condition
          owners and due dates in the comments; structured follow-up
          tracking is not yet connected. Security remains the exception
          approval authority.
        </p>

        <Button appearance="primary" onClick={saveDecision}>
          Record decision
        </Button>
      </section>
    </section>
  );
}