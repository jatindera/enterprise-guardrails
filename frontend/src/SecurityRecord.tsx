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

interface SecurityRecordProps {
  project: Project;
}

type SecurityDecision =
  | "Approved"
  | "Conditional approval"
  | "On hold"
  | "Rejected";

type SecurityRisk = "Low" | "Medium" | "High";

interface SecurityArtifact {
  id: string;
  kind: "Closing report" | "Approval email";
  file: File;
  addedAt: string;
}

interface SecurityCondition {
  id: string;
  description: string;
  owner: string;
  dueDate: string;
  comments: string;
  status: "Open" | "Closed";
  closedBy?: string;
  closedAt?: string;
}

interface DecisionRecord {
  id: string;
  decision: SecurityDecision;
  risk: SecurityRisk;
  reviewer: string;
  comments: string;
  recordedAt: string;
  artifacts: {
    id: string;
    kind: SecurityArtifact["kind"];
    fileName: string;
  }[];
  conditions: SecurityCondition[];
}

export default function SecurityRecord({
  project,
}: SecurityRecordProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const reportInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const [artifacts, setArtifacts] =
    useState<SecurityArtifact[]>([]);

  const [reviewer, setReviewer] = useState("");
  const [risk, setRisk] = useState<SecurityRisk | "">("");
  const [decision, setDecision] =
    useState<SecurityDecision | "">("");
  const [decisionComments, setDecisionComments] = useState("");

  const [conditions, setConditions] =
    useState<SecurityCondition[]>([]);
  const [conditionDescription, setConditionDescription] =
    useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const openCount = conditions.filter(
    (condition) => condition.status === "Open"
  ).length;

  const latestDecision = records[records.length - 1];

  useEffect(() => {
    if (conditions.length === 0) return;
    updateProject({ securityConditions: conditions.map(({ id, status, dueDate }) => ({ id, status, dueDate })) });
  }, [conditions, updateProject]);

  function attachFile(
    file: File | undefined,
    kind: SecurityArtifact["kind"]
  ) {
    setError("");
    setMessage("");

    if (!file) return;

    const name = file.name.toLowerCase();

    const allowed =
      kind === "Closing report"
        ? name.endsWith(".pdf")
        : [".eml", ".msg", ".pdf"].some((extension) =>
          name.endsWith(extension)
        );

    if (!allowed) {
      setError(
        kind === "Closing report"
          ? "Choose a PDF closing report."
          : "Choose an EML, MSG, or PDF copy of the approval email."
      );
      return;
    }

    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      setError("Choose a nonempty file no larger than 20 MB.");
      return;
    }

    setArtifacts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind,
        file,
        addedAt: new Date().toISOString(),
      },
    ]);

    setMessage(`${kind} attached locally.`);
  }

  function downloadArtifact(artifact: SecurityArtifact) {
    const url = URL.createObjectURL(artifact.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = artifact.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function addCondition() {
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
    setError("");
    setMessage("Security condition added.");
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
    const condition = conditions.find((item) => item.id === id);

    if (!reviewer.trim()) {
      setError("Enter the assigned Security reviewer first.");
      return;
    }

    if (!condition?.comments.trim()) {
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

    setError("");
    setMessage(
      "Condition closed locally. Reviewer identity is not authenticated yet."
    );
  }

  function reopenCondition(id: string) {
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

    setError("");
    setMessage("Condition reopened.");
  }

  function saveDecision() {
    if (!reviewer.trim() || !risk || !decision) {
      setError("Enter the assigned reviewer, risk rating, and decision.");
      return;
    }

    if (!decisionComments.trim()) {
      setError("Enter the Security decision comments.");
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

    updateProject({
      securityStatus: decision === "Conditional approval" ? "Conditional" : decision,
      securityRisk: risk,
      securityConditions: conditions.map(({ id, status, dueDate }) => ({ id, status, dueDate })),
    });
    setRecords((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        decision,
        risk,
        reviewer: reviewer.trim(),
        comments: decisionComments.trim(),
        recordedAt: new Date().toISOString(),
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          fileName: artifact.file.name,
        })),
        conditions: conditions.map((condition) => ({ ...condition })),
      },
    ]);

    setError("");
    setMessage("Security decision snapshot saved locally.");
  }

  return (
    <section className="security-record">
      <div className="session-heading">
        <div>
          <h2>Security record</h2>
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
          Security’s existing application remains the official system.
          Store copies of its evidence and decisions here. Files and
          records are held in memory and clear
          when the page is refreshed. Permissions are not enforced yet.
        </MessageBarBody>
      </MessageBar>

      <section className="content-panel security-section">
        <div className="panel-heading">
          <h2>Security review progress</h2>

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
            <strong>Security risk classification:</strong>{" "}
            {latestDecision?.risk ?? "Not recorded"}
          </p>

          <p>
            <strong>Assigned reviewer:</strong>{" "}
            {latestDecision?.reviewer ?? "Not recorded"}
          </p>

          <p>
            <strong>Conditions:</strong> {openCount} open
            {" · "}
            {conditions.length - openCount} closed
          </p>

          {latestDecision && (
            <>
              <p className="security-preserve-text">
                <strong>Decision comments:</strong>{" "}
                {latestDecision.comments}
              </p>

              <p className="workspace-secondary">
                Recorded:{" "}
                {new Date(latestDecision.recordedAt).toLocaleString()}
              </p>
            </>
          )}

          {latestDecision?.decision === "Conditional approval" &&
            openCount === 0 && (
              <p className="workspace-secondary">
                All conditions are closed. The Security reviewer can
                record a new Approved decision below.
              </p>
            )}

          {latestDecision?.decision === "Approved" && openCount > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                Open conditions now exist after the last Approved decision.
                The assigned Security reviewer should reassess and record
                an updated decision. The previous decision remains in history.
              </MessageBarBody>
            </MessageBar>
          )}
          <p className="workspace-secondary">
            This summary shows the latest saved decision, not unsaved
            form changes.
          </p>
        </div>
      </section>

      <section className="content-panel security-section">
        <div className="panel-heading">
          <h2>Security evidence</h2>
        </div>

        <div className="workspace-panel-body">
          <input
            ref={reportInput}
            type="file"
            accept=".pdf"
            hidden
            onChange={(event) => {
              attachFile(
                event.currentTarget.files?.[0],
                "Closing report"
              );
              event.currentTarget.value = "";
            }}
          />

          <input
            ref={emailInput}
            type="file"
            accept=".eml,.msg,.pdf"
            hidden
            onChange={(event) => {
              attachFile(
                event.currentTarget.files?.[0],
                "Approval email"
              );
              event.currentTarget.value = "";
            }}
          />

          <div className="meeting-review-actions">
            <Button
              appearance="primary"
              onClick={() => reportInput.current?.click()}
            >
              Upload closing report (.pdf)
            </Button>

            <Button onClick={() => emailInput.current?.click()}>
              Upload approval email
            </Button>

            <Button disabled>Upoload</Button>
          </div>

          <p className="workspace-secondary">
            AI extraction awaits integration. Later, you will review
            extracted values before applying them to the assessment.
            Email attachments accept EML, MSG, or PDF. Maximum 20 MB per file.
          </p>

          {artifacts.length === 0 && (
            <p>No Security evidence attached yet.</p>
          )}

          {artifacts.map((artifact) => (
            <article className="ea-record" key={artifact.id}>
              <Badge appearance="tint">{artifact.kind}</Badge>
              <h3>{artifact.file.name}</h3>

              <p className="workspace-secondary">
                Attached: {new Date(artifact.addedAt).toLocaleString()}
                {" · "}
                {(artifact.file.size / 1024 / 1024).toFixed(2)} MB
              </p>

              <Button onClick={() => downloadArtifact(artifact)}>
                Download
              </Button>
            </article>
          ))}
        </div>
      </section>



      <section className="content-panel security-section">
        <div className="panel-heading">
          <h2>Conditions & follow-up</h2>

          <Badge appearance="tint" color="warning">
            {openCount} open
          </Badge>
        </div>

        <div className="workspace-panel-body">
          <div className="ea-create-item">
            <h3>Add a Security condition</h3>

            <label className="session-field">
              Description
              <Textarea
                value={conditionDescription}
                rows={3}
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
            <p>No Security conditions recorded.</p>
          )}

          {conditions.map((condition, index) => {
            const overdue =
              condition.status === "Open" &&
              new Date(`${condition.dueDate}T23:59:59`).getTime() <
              Date.now();

            return (
              <article className="ea-record" key={condition.id}>
                <div className="panel-heading">
                  <h3>SEC-{index + 1}</h3>

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

                <p>{condition.description}</p>

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
                    disabled={!reviewer.trim() || !condition.comments.trim()}
                    onClick={() => closeCondition(condition.id)}
                  >
                    Close locally as assigned reviewer
                  </Button>
                )}
              </article>
            );
          })}

          <p className="workspace-secondary">
            The assigned Security reviewer is the closure authority.
            This prototype records the entered name; authenticated
            reviewer-only closure will be enforced by the backend.
          </p>
        </div>
      </section>

      <section className="content-panel security-section">
        <div className="panel-heading">
          <h2>Assessment & decision</h2>
        </div>

        <div className="workspace-panel-body">
          <label className="session-field">
            Assigned Security reviewer
            <Input
              value={reviewer}
              placeholder="Reviewer name or email"
              onChange={(_, data) => setReviewer(data.value)}
            />
          </label>

          <label className="session-field">
            Security risk Classification
            <Select
              value={risk}
              onChange={(_, data) =>
                setRisk(data.value as SecurityRisk | "")
              }
            >
              <option value="">Select risk</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </Select>
          </label>

          <label className="session-field">
            Security decision
            <Select
              value={decision}
              onChange={(_, data) =>
                setDecision(data.value as SecurityDecision | "")
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
              placeholder="Record the decision communicated by Security…"
              onChange={(_, data) =>
                setDecisionComments(data.value)
              }
            />
          </label>

          <p className="workspace-secondary">
            Conditional Security approval permits production from
            the Security perspective while conditions are tracked.
            Other applicable approvals and the production gate still apply.
          </p>

          <Button appearance="primary" onClick={saveDecision}>
            Save local decision snapshot
          </Button>
        </div>
      </section>

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

      <section className="content-panel security-section">
        <div className="panel-heading">
          <h2>Recorded decisions</h2>
        </div>

        <div className="workspace-panel-body">
          {records.length === 0 ? (
            <p>No decision snapshots saved yet.</p>
          ) : (
            [...records].reverse().map((record) => (
              <article className="ea-record" key={record.id}>
                <h3>{record.decision}</h3>

                <p>
                  Risk: {record.risk}
                  {" · "}
                  Reviewer: {record.reviewer}
                </p>

                <p className="security-preserve-text">
                  {record.comments}
                </p>

                <p className="workspace-secondary">
                  Recorded: {new Date(record.recordedAt).toLocaleString()}
                </p>

                <details>
                  <summary>Conditions and evidence at decision time</summary>

                  {record.artifacts.length === 0 ? (
                    <p>No evidence attached at decision time.</p>
                  ) : (
                    record.artifacts.map((artifact) => (
                      <p key={artifact.id}>
                        {artifact.kind}: {artifact.fileName}
                      </p>
                    ))
                  )}

                  {record.conditions.length === 0 ? (
                    <p>No conditions recorded at decision time.</p>
                  ) : (
                    record.conditions.map((condition) => (
                      <div key={condition.id}>
                        <p>
                          {condition.status}: {condition.description}
                        </p>
                        <p className="workspace-secondary">
                          Owner: {condition.owner}
                          {" · "}
                          Due: {condition.dueDate}
                        </p>
                        <p className="security-preserve-text">
                          {condition.comments}
                        </p>
                      </div>
                    ))
                  )}
                </details>
              </article>
            ))
          )}

          <p className="workspace-secondary">
            Snapshots retain the conditions and evidence references
            recorded at that time. Later changes do not alter them.
            Saving does not update Intake or portfolio status.
          </p>
        </div>
      </section>
    </section>
  );
}