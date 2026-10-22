import { useProjectUpdate } from "./ProjectUpdates";
import { useState } from "react";

import {
  Badge,
  Button,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

import FileDropZone from "./FileDropZone";
import type { Project } from "./types";

interface ARBReviewProps {
  project: Project;
}

type ArtifactKind =
  | "ADR PowerPoint"
  | "Transcript"
  | "Supporting document";

interface ARBArtifact {
  id: string;
  kind: ArtifactKind;
  file: File;
  addedAt: string;
}

interface ARBRecord {
  id: string;
  recordedAt: string;
  meetingDate: string;
  meetingHeld: boolean;
  attendees: string;
  corePresent: number;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  votePassed: boolean;
  eaApprovalConfirmed: boolean;
  returnedForReview: boolean;
  notes: string;
  actions: string;
  assignedEA: string;
  outcome: "Completed" | "Returned for review" | "Pending";
  artifacts: {
    id: string;
    kind: ArtifactKind;
    fileName: string;
  }[];
}

const documentGroups: {
  kind: ArtifactKind;
  label: string;
  extensions: string[];
}[] = [
    {
      kind: "Supporting document",
      label: "Documents for ADR preparation",
      extensions: [
        ".pdf",
        ".docx",
        ".pptx",
        ".txt",
        ".vtt",
        ".md",
        ".png",
        ".jpg",
        ".jpeg",
        ".drawio",
        ".vsdx",
      ],
    },
  ];



export default function ARBReview({ project }: ARBReviewProps) {
  const updateProject = useProjectUpdate(project.demandId);
  // Retain the initial applicability during this workspace session.
  const [initiallyRequired] = useState(
    project.arbStatus !== "Not applicable",
  );

  const [previousARB, setPreviousARB] = useState<{
    status: Project["arbStatus"];
    completionDate?: string;
  }>({
    status:
      project.arbStatus === "Not applicable"
        ? "Not scheduled"
        : project.arbStatus,
    completionDate: project.arbCompletionDate,
  });

  const notApplicable = project.arbStatus === "Not applicable";

  function changeApplicability(checked: boolean) {
    if (!initiallyRequired) return;

    setError("");
    setMessage("");

    if (checked) {
      setPreviousARB({
        status: project.arbStatus,
        completionDate: project.arbCompletionDate,
      });

      updateProject({
        arbStatus: "Not applicable",
        arbCompletionDate: undefined,
      });
    } else {
      const canRestoreCompletion =
        previousARB.status === "Completed" &&
        project.eaStatus === "Approved";

      updateProject({
        arbStatus:
          previousARB.status === "Completed" &&
            !canRestoreCompletion
            ? "In progress"
            : previousARB.status,
        arbCompletionDate: canRestoreCompletion
          ? previousARB.completionDate
          : undefined,
      });
    }
  }
  const [artifacts, setArtifacts] = useState<ARBArtifact[]>([]);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingHeld, setMeetingHeld] = useState(false);
  const [attendees, setAttendees] = useState("");

  const [corePresent, setCorePresent] = useState("");
  const [votesFor, setVotesFor] = useState("0");
  const [votesAgainst, setVotesAgainst] = useState("0");
  const [abstentions, setAbstentions] = useState("0");

  const [eaApprovalConfirmed, setEAApprovalConfirmed] =
    useState(project.eaStatus === "Approved");

  const [returnedForReview, setReturnedForReview] = useState(false);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");

  const [records, setRecords] = useState<ARBRecord[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  
  const present = Number(corePresent);
  const favourable = Number(votesFor);
  const against = Number(votesAgainst);
  const abstained = Number(abstentions);

  const validVote =
    [corePresent, votesFor, votesAgainst, abstentions].every(
      (value) =>
        /^\d+$/.test(value) &&
        Number.isSafeInteger(Number(value))
    ) &&
    present > 0 &&
    favourable + against + abstained === present;

  const votePassed = validVote && favourable > present / 2;

  function attachFiles(files: File[], kind: ArtifactKind) {
    setError("");
    setMessage("");

    if (files.length === 0) return;

    const group = documentGroups.find((item) => item.kind === kind);

    if (!group) return;

    const invalid = files.find(
      (file) =>
        !group.extensions.some((extension) =>
          file.name.toLowerCase().endsWith(extension)
        ) ||
        file.size === 0 ||
        file.size > 20 * 1024 * 1024
    );

    if (invalid) {
      setError(
        `No files added. Check "${invalid.name}". ` +
        "Use a supported, nonempty file no larger than 20 MB."
      );
      return;
    }

    const addedAt = new Date().toISOString();

    const additions: ARBArtifact[] = files.map((file) => ({
      id: crypto.randomUUID(),
      kind,
      file,
      addedAt,
    }));

    setArtifacts((current) => [...current, ...additions]);

    setMessage(
      `${files.length} file${files.length === 1 ? "" : "s"} added locally.`
    );
  }

  function downloadArtifact(artifact: ARBArtifact) {
    const url = URL.createObjectURL(artifact.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = artifact.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveRecord() {
    setError("");
    setMessage("");
    if (notApplicable) return;

    if (!meetingDate) {
      setError("Enter the ARB meeting date.");
      return;
    }

    if (meetingHeld && !validVote) {
      setError(
        "Enter the attending core-member count and all votes. " +
        "For, Against, and Abstain must total the attending core members."
      );
      return;
    }

    if (returnedForReview && (!meetingHeld || !notes.trim())) {
      setError(
        "For a returned review, confirm the meeting was held " +
        "and explain what needs another review."
      );
      return;
    }

    const outcome: ARBRecord["outcome"] = returnedForReview
      ? "Returned for review"
      : meetingHeld && votePassed && eaApprovalConfirmed && project.eaStatus === "Approved"
        ? "Completed"
        : "Pending";

    const record: ARBRecord = {
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      meetingDate,
      meetingHeld,
      attendees: attendees.trim(),
      corePresent: meetingHeld ? present : 0,
      votesFor: meetingHeld ? favourable : 0,
      votesAgainst: meetingHeld ? against : 0,
      abstentions: meetingHeld ? abstained : 0,
      votePassed: meetingHeld && votePassed,
      eaApprovalConfirmed,
      returnedForReview,
      notes: notes.trim(),
      actions: actions.trim(),
      assignedEA: project.assignedEA,
      outcome,
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        fileName: artifact.file.name,
      })),
    };

    updateProject({
      arbStatus: outcome === "Pending" ? "In progress" : outcome,
      arbCompletionDate: outcome === "Completed" ? meetingDate : undefined,
    });
    setRecords((current) => [...current, record]);
    setMessage(`ARB record saved locally: ${outcome}.`);
  }

  return (
    <section className="arb-review">
      <div className="session-heading">
        <div>
          <h2>ARB review</h2>
          <p>
            Demand #{project.demandId}
            {" · "}
            Presenting EA: {project.assignedEA}
          </p>
        </div>

        <Badge
          appearance="tint"
          color={
            project.arbStatus === "Completed"
              ? "success"
              : project.arbStatus === "Returned for review"
                ? "warning"
                : "informative"
          }
        >
          {project.arbStatus}
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Local prototype. Files, votes, and records are retained during
          this app session and clear on refresh. Reviewer permissions, ADR
          generation, and backend persistence await integration.
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
      <section className="content-panel arb-section">
        <div className="workspace-panel-body">
          <Checkbox
            label="ARB is not applicable to this project"
            checked={notApplicable}
            disabled={!initiallyRequired}
            onChange={(_, data) =>
              changeApplicability(data.checked === true)
            }
          />

          {notApplicable && (
            <p className="workspace-secondary">
              No ARB meeting or voting is required. Existing documents
              and records are retained.
            </p>
          )}
        </div>
      </section>

      <div hidden={notApplicable}>


        <section className="content-panel arb-section">
          <div className="panel-heading">
            <h2>ADR & meeting documents</h2>

            <Badge appearance="tint" color="informative">
              {artifacts.length} files
            </Badge>
          </div>

          <div className="workspace-panel-body">


            <p className="workspace-secondary">
              Select several files together or drag and drop them.
              Upload again anytime to add more. Revised ADR decks
              are retained as additional attachments.
            </p>

            <div className="arb-upload-grid">
              {documentGroups.map((group) => (
                <FileDropZone
                  key={group.kind}
                  label={group.label}
                  extensions={group.extensions}
                  onFiles={(files) => attachFiles(files, group.kind)}
                />
              ))}
            </div>

            <h3>Uploaded documents ({artifacts.length})</h3>

            {artifacts.length === 0 ? (
              <p className="workspace-secondary">
                No documents uploaded yet.
              </p>
            ) : (
              artifacts.map((artifact, index) => (
                <article className="ea-record" key={artifact.id}>
                  <Badge appearance="tint">
                    {artifact.kind}
                  </Badge>

                  <h4>
                    {index + 1}. {artifact.file.name}
                  </h4>

                  <p className="workspace-secondary">
                    Added: {new Date(artifact.addedAt).toLocaleString()}
                    {" · "}
                    {(artifact.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  <Button onClick={() => downloadArtifact(artifact)}>
                    Download
                  </Button>
                </article>
              ))
            )}
            <div className="arb-generation-box">
              <h3>Create ADR from project information</h3>

              <p className="workspace-secondary">
                Upload transcripts, architecture diagrams, and supporting
                documents. Select multiple files together or drag and drop them.
                You can add more files later. The predefined ADR template is
                stored centrally and does not need to be uploaded here.
              </p>

              <div className="meeting-review-actions">
                <Button disabled>Generate ADR PowerPoint</Button>

                <Badge appearance="tint" color="warning">
                  Awaiting template and agent integration
                </Badge>
              </div>
            </div>
          </div>
        </section>

        <section className="content-panel arb-section">
          <div className="panel-heading">
            <h2>Meeting & core-team vote</h2>
          </div>

          <div className="workspace-panel-body">
            <label className="session-field">
              Meeting date
              <Input
                type="date"
                value={meetingDate}
                onChange={(_, data) => setMeetingDate(data.value)}
              />
            </label>

            <Checkbox
              label="The ARB meeting was held"
              checked={meetingHeld}
              onChange={(_, data) =>
                setMeetingHeld(data.checked === true)
              }
            />

            <label className="session-field">
              Attendees / core members present
              <Textarea
                value={attendees}
                rows={3}
                placeholder="List attendees and identify attending core members…"
                onChange={(_, data) => setAttendees(data.value)}
              />
            </label>

            <p className="workspace-secondary">
              Only attending core members vote. Other attendees do not.
              Passing requires more than half of attending core members
              voting in favour.
            </p>

            <div className="arb-vote-grid">
              <label className="session-field">
                Core members present
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={corePresent}
                  onChange={(_, data) => setCorePresent(data.value)}
                />
              </label>

              <label className="session-field">
                For
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={votesFor}
                  onChange={(_, data) => setVotesFor(data.value)}
                />
              </label>

              <label className="session-field">
                Against
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={votesAgainst}
                  onChange={(_, data) => setVotesAgainst(data.value)}
                />
              </label>

              <label className="session-field">
                Abstain
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={abstentions}
                  onChange={(_, data) => setAbstentions(data.value)}
                />
              </label>
            </div>

            <p className="workspace-secondary">
              Vote result:{" "}
              {!meetingHeld
                ? "Awaiting meeting"
                : !validVote
                  ? "Complete the vote counts"
                  : votePassed
                    ? "Majority in favour"
                    : "No majority in favour"}
            </p>

            <label className="session-field">
              Discussion notes
              <Textarea
                value={notes}
                rows={4}
                placeholder="Record inputs, decisions, or reasons for another review…"
                onChange={(_, data) => setNotes(data.value)}
              />
            </label>

            <label className="session-field">
              EA action items / progress
              <Textarea
                value={actions}
                rows={4}
                placeholder="List actions and update their progress here…"
                onChange={(_, data) => setActions(data.value)}
              />
            </label>

            <p className="workspace-secondary">
              Action owner: {project.assignedEA}.
            </p>

            <Checkbox
              label="Confirm the assigned EA has separately approved the architecture"
              checked={eaApprovalConfirmed}
              onChange={(_, data) =>
                setEAApprovalConfirmed(data.checked === true)
              }
            />

            <p className="workspace-secondary">
              This records confirmation of separate EA approval;
              it does not issue that approval.
            </p>

            <Checkbox
              label="Returned for another ARB review"
              checked={returnedForReview}
              onChange={(_, data) =>
                setReturnedForReview(data.checked === true)
              }
            />

            <div className="meeting-review-actions">
              <Button appearance="primary" onClick={saveRecord}>
                Save local ARB record
              </Button>
            </div>

            <p className="workspace-secondary">
              Completed requires a held meeting, a favourable
              majority vote, and separate EA approval.
              Returned reviews are not completed.
            </p>
          </div>
        </section>

        <section className="content-panel arb-section">
          <div className="panel-heading">
            <h2>Review history</h2>
          </div>

          <div className="workspace-panel-body">
            {records.length === 0 ? (
              <p>No ARB records saved yet.</p>
            ) : (
              [...records].reverse().map((record) => (
                <article className="ea-record" key={record.id}>
                  <h3>{record.outcome}</h3>

                  <p>
                    Meeting: {record.meetingDate}
                    {" · "}
                    Core present: {record.corePresent}
                  </p>

                  <p>
                    For: {record.votesFor}
                    {" · "}
                    Against: {record.votesAgainst}
                    {" · "}
                    Abstain: {record.abstentions}
                  </p>

                  <p className="workspace-secondary">
                    Saved: {new Date(record.recordedAt).toLocaleString()}
                  </p>

                  <details>
                    <summary>Read saved record</summary>

                    <p>
                      Meeting held: {record.meetingHeld ? "Yes" : "No"}
                    </p>

                    <p>
                      EA approval confirmed:{" "}
                      {record.eaApprovalConfirmed ? "Yes" : "No"}
                    </p>

                    <p>
                      Returned for review:{" "}
                      {record.returnedForReview ? "Yes" : "No"}
                    </p>

                    <h4>Attendees</h4>
                    <p className="arb-preserve-text">
                      {record.attendees || "Not recorded"}
                    </p>

                    <h4>Discussion notes</h4>
                    <p className="arb-preserve-text">
                      {record.notes || "None"}
                    </p>

                    <h4>EA actions</h4>
                    <p>Owner: {record.assignedEA}</p>
                    <p className="arb-preserve-text">
                      {record.actions || "None recorded"}
                    </p>

                    <h4>Documents at record time</h4>
                    {record.artifacts.length === 0 ? (
                      <p>No documents attached.</p>
                    ) : (
                      record.artifacts.map((artifact) => (
                        <p key={artifact.id}>
                          {artifact.kind}: {artifact.fileName}
                        </p>
                      ))
                    )}
                  </details>
                </article>
              ))
            )}

            <p className="workspace-secondary">
              These snapshots belong to the same project, not separate
              completed ARBs. Completion reporting will count the
              project once. Later uploads do not change earlier snapshots.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}