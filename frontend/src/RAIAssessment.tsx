import { useProjectUpdate } from "./ProjectUpdates";
import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Textarea,
} from "@fluentui/react-components";

import type { Project } from "./types";

interface RAIAssessmentProps {
  project: Project;
}

type RAIRisk = "Low" | "Medium" | "High";

type RAIDecision =
  | "Approved"
  | "Conditional approval"
  | "On hold"
  | "Rejected";

interface RAIEvidence {
  id: string;
  file: File;
  addedAt: string;
}

interface RAICondition {
  id: string;
  description: string;
  owner: string;
  dueDate: string;
  comments: string;
  status: "Open" | "Closed";
  closedBy?: string;
  closedAt?: string;
}

interface RAISnapshot {
  id: string;
  recordedAt: string;
  reviewer: string;
  summary: string;
  risk: RAIRisk;
  rationale: string;
  decision: RAIDecision;
  comments: string;
  conditions: RAICondition[];
  evidence: {
    id: string;
    fileName: string;
  }[];
}

export default function RAIAssessment({
  project,
}: RAIAssessmentProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [reviewer, setReviewer] = useState("");
  const [summary, setSummary] = useState("");
  const [risk, setRisk] = useState<RAIRisk | "">("");
  const [rationale, setRationale] = useState("");
  const [decision, setDecision] = useState<RAIDecision | "">("");
  const [decisionComments, setDecisionComments] = useState("");

  const [evidence, setEvidence] = useState<RAIEvidence[]>([]);
  const [conditions, setConditions] = useState<RAICondition[]>([]);
  const [records, setRecords] = useState<RAISnapshot[]>([]);

  const [conditionDescription, setConditionDescription] =
    useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const latestDecision = records[records.length - 1];

  useEffect(() => {
    if (conditions.length === 0) return;
    updateProject({
      raiConditions: conditions.map((condition) => ({
        ...condition,
      })),
    });
  }, [conditions, updateProject]);

  const openCount = conditions.filter(
    (condition) => condition.status === "Open"
  ).length;

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function attachEvidence(file: File | undefined) {
    clearFeedback();

    if (!file) return;

    const allowed = [
      ".pdf",
      ".docx",
      ".xlsx",
      ".csv",
      ".txt",
      ".md",
      ".eml",
      ".msg",
      ".png",
      ".jpg",
      ".jpeg",
    ];

    if (
      !allowed.some((extension) =>
        file.name.toLowerCase().endsWith(extension)
      )
    ) {
      setError("Choose one of the supported evidence file types.");
      return;
    }

    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      setError("Choose a nonempty file no larger than 20 MB.");
      return;
    }

    setEvidence((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        file,
        addedAt: new Date().toISOString(),
      },
    ]);

    setMessage("RAI evidence attached locally.");
  }

  function downloadEvidence(item: RAIEvidence) {
    const url = URL.createObjectURL(item.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = item.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function addCondition() {
    clearFeedback();

    if (!conditionDescription.trim() || !owner.trim() || !dueDate) {
      setError("Enter a condition, action owner, and due date.");
      return;
    }

    setConditions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        description: conditionDescription.trim(),
        owner: owner.trim(),
        dueDate,
        comments: "",
        status: "Open",
      },
    ]);

    setConditionDescription("");
    setOwner("");
    setDueDate("");
    setMessage("RAI condition added.");
  }

  function updateConditionComments(id: string, comments: string) {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id
          ? { ...condition, comments }
          : condition
      )
    );
  }

  function closeCondition(id: string) {
    clearFeedback();

    const condition = conditions.find((item) => item.id === id);

    if (!condition || condition.status === "Closed") return;

    if (!reviewer.trim()) {
      setError("Enter the assigned RAI manager before closing a condition.");
      return;
    }

    if (!condition.comments.trim()) {
      setError("Add closure comments describing the evidence reviewed.");
      return;
    }

    setConditions((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            status: "Closed",
            closedBy: reviewer.trim(),
            closedAt: new Date().toISOString(),
          }
          : item
      )
    );

    setMessage(
      "Condition closed locally. Reviewer identity is not authenticated yet."
    );
  }

  function reopenCondition(id: string) {
    clearFeedback();

    setConditions((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            status: "Open",
            closedBy: undefined,
            closedAt: undefined,
          }
          : item
      )
    );

    setMessage("RAI condition reopened.");
  }

  function saveDecision() {
    clearFeedback();

    if (
      !reviewer.trim() ||
      !summary.trim() ||
      !risk ||
      !rationale.trim() ||
      !decision ||
      !decisionComments.trim()
    ) {
      setError(
        "Complete the RAI manager, summary, risk, classification rationale, decision, and decision comments."
      );
      return;
    }

    if (decision === "Conditional approval" && openCount === 0) {
      setError("Add at least one open condition for conditional approval.");
      return;
    }

    if (decision === "Approved" && openCount > 0) {
      setError(
        "Open conditions remain. Close them or select Conditional approval."
      );
      return;
    }

    const snapshot: RAISnapshot = {
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      reviewer: reviewer.trim(),
      summary: summary.trim(),
      risk,
      rationale: rationale.trim(),
      decision,
      comments: decisionComments.trim(),
      conditions: conditions.map((condition) => ({ ...condition })),
      evidence: evidence.map((item) => ({
        id: item.id,
        fileName: item.file.name,
      })),
    };

    updateProject({
      raiStatus: decision === "Conditional approval" ? "Conditional" : decision,
      raiRisk: risk,
      raiConditions: conditions.map((condition) => ({
        ...condition,
      })),
    });
    setRecords((current) => [...current, snapshot]);
    setMessage("RAI decision snapshot saved locally.");
  }

  return (
    <section className="rai-assessment">
      <div className="session-heading">
        <div>
          <h2>Responsible AI assessment</h2>
          <p>
            Demand #{project.demandId} · {project.name}
          </p>
        </div>

        <Badge appearance="tint" color="warning">
          Local prototype
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Use the shared review session for stakeholder discussions.
          This page records the RAI assessment and decision.
          Files and records remain local until backend integration;
          refreshing the page clears them.
          Reviewer permissions are not enforced yet.
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

      <section className="content-panel rai-section">
        <div className="panel-heading">
          <h2>RAI review progress</h2>

          <Badge
            appearance="tint"
            color={
              !latestDecision
                ? "informative"
                : latestDecision.decision === "Approved"
                  ? "success"
                  : latestDecision.decision === "Rejected"
                    ? "danger"
                    : "warning"
            }
          >
            {latestDecision?.decision ?? "Decision pending"}
          </Badge>
        </div>

        <div className="workspace-panel-body">
          <p>
            <strong>RAI risk classification:</strong>{" "}
            {latestDecision?.risk ?? "Not recorded"}
          </p>

          <p>
            <strong>RAI manager:</strong>{" "}
            {latestDecision?.reviewer ?? "Not recorded"}
          </p>

          <p>
            <strong>Conditions:</strong> {openCount} open
            {" · "}
            {conditions.length - openCount} closed
          </p>

          {latestDecision && (
            <>
              <p className="rai-preserve-text">
                <strong>Decision comments:</strong>{" "}
                {latestDecision.comments}
              </p>

              <p className="workspace-secondary">
                Recorded:{" "}
                {new Date(latestDecision.recordedAt).toLocaleString()}
              </p>
            </>
          )}

          {latestDecision?.decision === "Approved" && openCount > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                Open conditions now exist after the last approval.
                The RAI manager should reassess and record an updated
                decision. The previous decision remains in history.
              </MessageBarBody>
            </MessageBar>
          )}

          {latestDecision?.decision === "Conditional approval" &&
            openCount === 0 && (
              <p className="workspace-secondary">
                All conditions are closed. The RAI manager can review
                completion and record a new Approved decision.
              </p>
            )}

          <p className="workspace-secondary">
            Decision details show the latest saved snapshot.
            Condition counts show the current follow-up position.
          </p>
        </div>
      </section>

      <section className="content-panel rai-section">
        <div className="panel-heading">
          <h2>Assessment summary & evidence</h2>
        </div>

        <div className="workspace-panel-body">
          <label className="session-field">
            Assigned RAI manager
            <Input
              value={reviewer}
              placeholder="RAI manager name or email"
              onChange={(_, data) => setReviewer(data.value)}
            />
          </label>

          <label className="session-field">
            Assessment summary
            <Textarea
              value={summary}
              rows={6}
              placeholder="Describe the AI use, affected users, autonomy, human oversight, potential harm, testing, and monitoring…"
              onChange={(_, data) => setSummary(data.value)}
            />
          </label>

          <p className="workspace-secondary">
            Reference relevant discussion and testing, including
            accuracy, fairness, privacy, robustness, prompt injection,
            and agent actions where applicable.
          </p>

          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.eml,.msg,.png,.jpg,.jpeg"
            onChange={(event) => {
              attachEvidence(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />

          <div className="meeting-review-actions">
            <Button
              appearance="primary"
              onClick={() => fileInput.current?.click()}
            >
              Upload RAI evidence
            </Button>

            <Button disabled>
              Assess with AI · Awaiting integration
            </Button>
          </div>

          <p className="workspace-secondary">
            Attach assessments, test results, supporting documents,
            or email copies. Maximum 20 MB per file. Files are
            retained locally without automated analysis.
          </p>

          {evidence.length === 0 && (
            <p>No RAI evidence attached yet.</p>
          )}

          {evidence.map((item) => (
            <article className="ea-record" key={item.id}>
              <h3>{item.file.name}</h3>

              <p className="workspace-secondary">
                Attached: {new Date(item.addedAt).toLocaleString()}
                {" · "}
                {(item.file.size / 1024 / 1024).toFixed(2)} MB
              </p>

              <Button onClick={() => downloadEvidence(item)}>
                Download
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="content-panel rai-section">
        <div className="panel-heading">
          <h2>Conditions & follow-up</h2>

          <Badge appearance="tint" color="warning">
            {openCount} open
          </Badge>
        </div>

        <div className="workspace-panel-body">
          <div className="ea-create-item">
            <h3>Add a RAI condition</h3>

            <label className="session-field">
              Description
              <Textarea
                value={conditionDescription}
                rows={3}
                placeholder="Describe the required action…"
                onChange={(_, data) =>
                  setConditionDescription(data.value)
                }
              />
            </label>

            <label className="session-field">
              Action owner
              <Input
                value={owner}
                placeholder="Development, business, IT owner, or EA"
                onChange={(_, data) => setOwner(data.value)}
              />
            </label>

            <label className="session-field">
              Due date
              <Input
                type="date"
                value={dueDate}
                onChange={(_, data) => setDueDate(data.value)}
              />
            </label>

            <Button appearance="primary" onClick={addCondition}>
              Add condition
            </Button>
          </div>

          {conditions.length === 0 && (
            <p>No RAI conditions recorded.</p>
          )}

          {conditions.map((condition, index) => {
            const overdue =
              condition.status === "Open" &&
              new Date(`${condition.dueDate}T23:59:59`).getTime() <
              Date.now();

            return (
              <article className="ea-record" key={condition.id}>
                <div className="panel-heading">
                  <h3>RAI-{index + 1}</h3>

                  <Badge
                    appearance="tint"
                    color={
                      condition.status === "Closed"
                        ? "success"
                        : overdue
                          ? "danger"
                          : "warning"
                    }
                  >
                    {condition.status === "Closed"
                      ? "Closed"
                      : overdue
                        ? "Open · Overdue"
                        : "Open"}
                  </Badge>
                </div>

                <p className="rai-preserve-text">
                  {condition.description}
                </p>

                <p className="workspace-secondary">
                  Owner: {condition.owner}
                  {" · "}
                  Due: {condition.dueDate}
                </p>

                <label className="session-field">
                  Progress / closure comments
                  <Textarea
                    value={condition.comments}
                    rows={3}
                    disabled={condition.status === "Closed"}
                    placeholder="Record progress and evidence reviewed for closure…"
                    onChange={(_, data) =>
                      updateConditionComments(condition.id, data.value)
                    }
                  />
                </label>

                {condition.status === "Closed" ? (
                  <>
                    <p className="workspace-secondary">
                      Closed by: {condition.closedBy}
                      {" · "}
                      {condition.closedAt
                        ? new Date(condition.closedAt).toLocaleString()
                        : ""}
                    </p>

                    <Button
                      onClick={() => reopenCondition(condition.id)}
                    >
                      Reopen locally
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={
                      !reviewer.trim() || !condition.comments.trim()
                    }
                    onClick={() => closeCondition(condition.id)}
                  >
                    Close locally as RAI manager
                  </Button>
                )}
              </article>
            );
          })}

          <p className="workspace-secondary">
            Closure records the entered RAI manager name in this
            prototype. Backend integration will authenticate and
            enforce closure permissions.
          </p>
        </div>
      </section>

      <section className="content-panel rai-section">
        <div className="panel-heading">
          <h2>Assessment & decision</h2>
        </div>

        <div className="workspace-panel-body">
          <label className="session-field">
            RAI risk classification
            <Select
              value={risk}
              onChange={(_, data) =>
                setRisk(data.value as RAIRisk | "")
              }
            >
              <option value="">Select RAI risk</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </Select>
          </label>

          <label className="session-field">
            Classification rationale
            <Textarea
              value={rationale}
              rows={4}
              placeholder="Explain the rating using the use case, potential harm, controls, testing, and relevant pattern experience…"
              onChange={(_, data) => setRationale(data.value)}
            />
          </label>

          <p className="workspace-secondary">
            RAI risk is separate from EA complexity and Security risk.
            A familiar pattern can inform the rationale, but the
            project’s actual use and consequences still need review.
          </p>

          <label className="session-field">
            RAI decision
            <Select
              value={decision}
              onChange={(_, data) =>
                setDecision(data.value as RAIDecision | "")
              }
            >
              <option value="">Select decision</option>
              <option value="Approved">Approved</option>
              <option value="Conditional approval">
                Conditional approval
              </option>
              <option value="On hold">On hold</option>
              <option value="Rejected">Rejected</option>
            </Select>
          </label>

          <label className="session-field">
            Decision comments
            <Textarea
              value={decisionComments}
              rows={4}
              placeholder="Explain the decision and any outstanding work…"
              onChange={(_, data) =>
                setDecisionComments(data.value)
              }
            />
          </label>

          <p className="workspace-secondary">
            Conditional RAI approval permits production from the
            RAI perspective while conditions are tracked. Other
            applicable approvals and the production gate still apply.
            Only Security authorizes risk exceptions.
          </p>

          <Button appearance="primary" onClick={saveDecision}>
            Save local RAI decision snapshot
          </Button>
        </div>
      </section>

      <section className="content-panel rai-section">
        <div className="panel-heading">
          <h2>Recorded decisions</h2>
        </div>

        <div className="workspace-panel-body">
          {records.length === 0 ? (
            <p>No RAI decision snapshots saved yet.</p>
          ) : (
            [...records].reverse().map((record) => (
              <article className="ea-record" key={record.id}>
                <h3>{record.decision}</h3>

                <p>
                  RAI risk: {record.risk}
                  {" · "}
                  RAI manager: {record.reviewer}
                </p>

                <p className="rai-preserve-text">
                  {record.comments}
                </p>

                <p className="workspace-secondary">
                  Recorded:{" "}
                  {new Date(record.recordedAt).toLocaleString()}
                </p>

                <details>
                  <summary>Read assessment snapshot</summary>

                  <h4>Assessment summary</h4>
                  <p className="rai-preserve-text">
                    {record.summary}
                  </p>

                  <h4>Classification rationale</h4>
                  <p className="rai-preserve-text">
                    {record.rationale}
                  </p>

                  <h4>Evidence at decision time</h4>
                  {record.evidence.length === 0 ? (
                    <p>No evidence attached at decision time.</p>
                  ) : (
                    record.evidence.map((item) => (
                      <p key={item.id}>{item.fileName}</p>
                    ))
                  )}

                  <h4>Conditions at decision time</h4>
                  {record.conditions.length === 0 ? (
                    <p>No conditions recorded at decision time.</p>
                  ) : (
                    record.conditions.map((condition) => (
                      <div key={condition.id}>
                        <p className="rai-preserve-text">
                          {condition.status}: {condition.description}
                        </p>

                        <p className="workspace-secondary">
                          Owner: {condition.owner}
                          {" · "}
                          Due: {condition.dueDate}
                        </p>

                        <p className="rai-preserve-text">
                          {condition.comments}
                        </p>

                        {condition.closedAt && (
                          <p className="workspace-secondary">
                            Closed by: {condition.closedBy}
                            {" · "}
                            {new Date(
                              condition.closedAt
                            ).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </details>
              </article>
            ))
          )}

          <p className="workspace-secondary">
            Saved snapshots retain the assessment, classification
            rationale, conditions, and evidence references from that
            time. Saving does not update Intake or portfolio status.
          </p>
        </div>
      </section>
    </section>
  );
}