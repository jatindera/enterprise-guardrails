import { useState } from "react";

import {
  Badge,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

import type {
  AcceptedMeetingReview,
  EAFinding,
  EARequirement,
  Project,
} from "./types";

interface EAAssessmentProps {
  project: Project;
  acceptedReview: AcceptedMeetingReview | null;
  onOpenReviewSession: () => void;
}

export default function EAAssessment({
  project,
  acceptedReview,
  onOpenReviewSession,
}: EAAssessmentProps) {
  const [tab, setTab] =
    useState<"requirements" | "findings">("requirements");

  const [requirements, setRequirements] =
    useState<EARequirement[]>([]);

  const [findings, setFindings] =
    useState<EAFinding[]>([]);

  const [description, setDescription] = useState("");
  const [sourceReference, setSourceReference] = useState("");

  const [useMeetingReview, setUseMeetingReview] =
    useState(false);

  const [message, setMessage] = useState("");

  function addRecord() {
    if (!description.trim() || !sourceReference.trim()) {
      setMessage(
        "Enter a description and its evidence/source reference.",
      );
      return;
    }

    if (useMeetingReview && !acceptedReview) {
      setMessage(
        "The meeting review is no longer accepted. Review and accept it again, or use another source.",
      );
      return;
    }

    if (tab === "requirements") {
      const requirement: EARequirement = {
        id: crypto.randomUUID(),
        description: description.trim(),
        sourceReference: sourceReference.trim(),
        status: "Draft",
        ...(useMeetingReview && acceptedReview
          ? { sourceReview: { ...acceptedReview } }
          : {}),
      };

      setRequirements((current) => [...current, requirement]);
      setMessage(
        "Draft requirement added. Confirmation is a separate EA action.",
      );
    } else {
      const finding: EAFinding = {
        id: crypto.randomUUID(),
        description: description.trim(),
        sourceReference: sourceReference.trim(),
        status: "Open",
        resolution: "",
      };

      setFindings((current) => [...current, finding]);
      setMessage("Open finding added.");
    }

    setDescription("");
    setSourceReference("");
    setUseMeetingReview(false);
  }

  function sourceChanged(requirement: EARequirement) {
    return (
      requirement.sourceReview !== undefined &&
      requirement.sourceReview.acceptedAt !==
      acceptedReview?.acceptedAt
    );
  }

  function updateRequirement(id: string, value: string) {
    setRequirements((current) =>
      current.map((requirement) =>
        requirement.id === id
          ? {
            ...requirement,
            description: value,
            status: "Draft",
          }
          : requirement,
      ),
    );
  }

  function confirmRequirement(id: string) {
    const requirement = requirements.find(
      (item) => item.id === id,
    );

    if (!requirement || !requirement.description.trim()) return;

    const changed = sourceChanged(requirement);

    if (changed && !acceptedReview) {
      setMessage(
        "Accept the updated meeting review before confirming this requirement.",
      );
      return;
    }

    if (changed && !requirement.comments?.trim()) {
      setMessage(
        "Add a short EA comment explaining the agreed change or why the requirement remains unchanged.",
      );
      return;
    }

    setRequirements((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            status: "Confirmed",
            ...(changed && acceptedReview
              ? {
                sourceReview: { ...acceptedReview },
                sourceReference:
                  `Accepted meeting review — ${acceptedReview.acceptedAt}`,
              }
              : {}),
          }
          : item,
      ),
    );

    setMessage("Requirement confirmed locally.");
  }

  function updateResolution(id: string, value: string) {
    setFindings((current) =>
      current.map((finding) =>
        finding.id === id
          ? {
            ...finding,
            resolution: value,
            status: "Open",
          }
          : finding,
      ),
    );
  }

  function resolveFinding(id: string) {
    setFindings((current) =>
      current.map((finding) =>
        finding.id === id && finding.resolution.trim()
          ? { ...finding, status: "Resolved" }
          : finding,
      ),
    );
  }

  function updateRequirementComments(id: string, comments: string) {
    setRequirements((current) =>
      current.map((requirement) =>
        requirement.id === id
          ? {
            ...requirement,
            comments,
            status: "Draft",
          }
          : requirement,
      ),
    );
  }

  return (
    <section>
      <div className="session-heading">
        <div>
          <h2>EA assessment</h2>
          <p>
            Demand #{project.demandId} · Assigned EA:{" "}
            {project.assignedEA}
          </p>
        </div>

        <Button onClick={onOpenReviewSession}>
          Open review session
        </Button>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Local development workflow. Confirmation and resolution
          are draft records, not authenticated approvals.
          Architecture diagrams and the EA report follow next.
        </MessageBarBody>
      </MessageBar>

      <section className="content-panel ea-evidence-panel">
        <div className="panel-heading">
          <h2>Accepted meeting review</h2>

          <Badge
            appearance="tint"
            color={acceptedReview ? "success" : "informative"}
          >
            {acceptedReview ? "Available" : "Not available"}
          </Badge>
        </div>

        <div className="workspace-panel-body">
          {acceptedReview ? (
            <>
              <p className="workspace-secondary">
                Accepted locally:{" "}
                {new Date(
                  acceptedReview.acceptedAt,
                ).toLocaleString()}
              </p>

              <details className="session-history">
                <summary>Read accepted review</summary>

                <pre className="intake-source-text">
                  {acceptedReview.text}
                </pre>
              </details>

              <div className="meeting-review-actions">
                <Button
                  onClick={() => {
                    setTab("requirements");
                    setUseMeetingReview(true);
                    setSourceReference(
                      `Accepted meeting review — ${acceptedReview.acceptedAt}`,
                    );
                    setMessage(
                      "Enter the specific requirement supported by this review.",
                    );
                  }}
                >
                  Create requirement from this evidence
                </Button>
              </div>
            </>
          ) : (
            <p className="session-body-text">
              Accept a review under Review session → Review meeting.
              It will appear here without copying and pasting.
            </p>
          )}
        </div>
      </section>

      <div
        className="meeting-phase-controls"
        aria-label="EA assessment section"
      >
        <Button
          appearance={
            tab === "requirements" ? "primary" : "secondary"
          }
          aria-pressed={tab === "requirements"}
          onClick={() => {
            setTab("requirements");
            setMessage("");
          }}
        >
          Requirements ({requirements.length})
        </Button>

        <Button
          appearance={
            tab === "findings" ? "primary" : "secondary"
          }
          aria-pressed={tab === "findings"}
          onClick={() => {
            setTab("findings");
            setUseMeetingReview(false);
            setMessage("");
          }}
        >
          Findings ({findings.length})
        </Button>
      </div>

      <section className="content-panel">
        <div className="panel-heading">
          <h2>
            {tab === "requirements"
              ? "Add draft requirement"
              : "Add finding"}
          </h2>
        </div>

        <div className="workspace-panel-body">
          <label className="session-field">
            Description
            <Textarea
              value={description}
              rows={4}
              placeholder={
                tab === "requirements"
                  ? "State one clear, reviewable requirement…"
                  : "Describe the gap, contradiction, or design concern…"
              }
              onChange={(_, data) =>
                setDescription(data.value)
              }
            />
          </label>

          <label className="session-field">
            Evidence / source reference
            <Input
              value={sourceReference}
              placeholder="e.g. Meeting 1, 00:12:30 · Data owner"
              onChange={(_, data) =>
                setSourceReference(data.value)
              }
            />
          </label>

          {useMeetingReview && (
            <p className="workspace-secondary">
              The accepted review snapshot will be retained
              with this requirement.
            </p>
          )}

          <Button appearance="primary" onClick={addRecord}>
            {tab === "requirements"
              ? "Add requirement"
              : "Add finding"}
          </Button>

          <p className="workspace-secondary" role="status">
            {message}
          </p>
        </div>
      </section>

      <section className="content-panel ea-record-list">
        <div className="panel-heading">
          <h2>
            {tab === "requirements"
              ? "Requirements register"
              : "Findings register"}
          </h2>
        </div>

        <div className="workspace-panel-body">
          {tab === "requirements" ? (
            requirements.length === 0 ? (
              <p className="session-body-text">
                No requirements recorded yet.
              </p>
            ) : (
              requirements.map((requirement, index) => {
                const changed = sourceChanged(requirement);

                return (
                  <article
                    key={requirement.id}
                    className="ea-record"
                  >
                    <div className="panel-heading">
                      <h2>R-{index + 1}</h2>

                      <Badge
                        appearance="tint"
                        color={
                          changed
                            ? "warning"
                            : requirement.status === "Confirmed"
                              ? "success"
                              : "informative"
                        }
                      >
                        {changed
                          ? "Source needs recheck"
                          : requirement.status}
                      </Badge>
                    </div>

                    <label className="session-field">
                      Requirement
                      <Textarea
                        value={requirement.description}
                        rows={3}
                        onChange={(_, data) =>
                          updateRequirement(
                            requirement.id,
                            data.value,
                          )
                        }
                      />
                    </label>

                    <p className="workspace-secondary">
                      Source: {requirement.sourceReference}
                    </p>

                    {requirement.sourceReview && (
                      <details className="session-history">
                        <summary>Read original source snapshot</summary>
                        <pre className="intake-source-text">
                          {requirement.sourceReview.text}
                        </pre>
                      </details>
                    )}

                    {changed && (
                      <p className="workspace-secondary">
                        Supporting evidence changed. Check the requirement,
                        add an EA comment, and confirm it again.
                      </p>
                    )}

                    <label className="session-field">
                      EA comments
                      <Textarea
                        value={requirement.comments ?? ""}
                        rows={3}
                        placeholder="e.g. Changed deletion from 30 to 90 days following agreement with the data owner."
                        onChange={(_, data) =>
                          updateRequirementComments(
                            requirement.id,
                            data.value,
                          )
                        }
                      />
                    </label>

                    <div className="meeting-review-actions">
                      <Button
                        disabled={
                          !requirement.description.trim() ||
                          (!changed && requirement.status === "Confirmed") ||
                          (changed &&
                            (!acceptedReview || !requirement.comments?.trim()))
                        }
                        onClick={() => confirmRequirement(requirement.id)}
                      >
                        Confirm requirement locally
                      </Button>
                    </div>
                  </article>
                );
              })
            )
          ) : findings.length === 0 ? (
            <p className="session-body-text">
              No findings recorded yet.
            </p>
          ) : (
            findings.map((finding, index) => (
              <article key={finding.id} className="ea-record">
                <div className="panel-heading">
                  <h2>F-{index + 1}</h2>

                  <Badge
                    appearance="tint"
                    color={
                      finding.status === "Resolved"
                        ? "success"
                        : "warning"
                    }
                  >
                    {finding.status}
                  </Badge>
                </div>

                <p className="session-body-text">
                  {finding.description}
                </p>

                <p className="workspace-secondary">
                  Source: {finding.sourceReference}
                </p>

                <label className="session-field">
                  Resolution and supporting evidence
                  <Textarea
                    value={finding.resolution}
                    rows={3}
                    placeholder="Describe the resolution and reference the evidence reviewed…"
                    onChange={(_, data) =>
                      updateResolution(
                        finding.id,
                        data.value,
                      )
                    }
                  />
                </label>

                <Button
                  disabled={
                    !finding.resolution.trim() ||
                    finding.status === "Resolved"
                  }
                  onClick={() => resolveFinding(finding.id)}
                >
                  Mark resolved locally
                </Button>
              </article>
            ))
          )}
        </div>
      </section>

      <p className="workspace-secondary">
        Requirements confirmation is separate from EA approval.
        Only Security authorizes exceptions. Records remain in
        memory and are cleared when leaving this project.
      </p>
    </section>
  );
}