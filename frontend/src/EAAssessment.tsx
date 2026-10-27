import { useEffect, useState } from "react";
import { useProjectUpdate } from "./ProjectUpdates";

import {
  Badge,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

import ArchitectureDiagrams from "./ArchitectureDiagrams";

import EAApprovalReport from "./EAApprovalReport";
import type { CurrentDiagramReference } from "./ArchitectureDiagrams";

import type {
  AcceptedMeetingReview,
  EAAction,
  Project,
} from "./types";

interface EAAssessmentProps {
  project: Project;
  readOnly?: boolean;
  acceptedReview: AcceptedMeetingReview | null;
  onOpenReviewSession: () => void;
}

export default function EAAssessment({
  project,
  readOnly = false,
  acceptedReview,
  onOpenReviewSession,
}: EAAssessmentProps) {
  const updateProject = useProjectUpdate(project.demandId);

  const [items, setItems] = useState<EAAction[]>(
    () => project.eaItems ?? [],
  );

  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (readOnly || items.length === 0) return;

    updateProject({
      eaItems: items.map((item) => ({
        ...item,
        owner: project.assignedEA,
      })),
    });
  }, [items, project.assignedEA, updateProject, readOnly]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  const openCount = items.filter(
    (item) => item.status === "Open",
  ).length;

  const closedCount = items.length - openCount;

  const [currentDiagram, setCurrentDiagram] =
    useState<CurrentDiagramReference | null>(null);

  function addItem() {
    const text = description.trim();

    if (!text) {
      setMessage("Enter a description before adding an item.");
      return;
    }

    const item: EAAction = {
      id: crypto.randomUUID(),
      description: text,
      comments: "",
      owner: project.assignedEA,
      dueDate,
      status: "Open",
      createdAt: new Date().toISOString(),
    };

    setItems((current) => [...current, item]);
    setDescription("");
    setDueDate("");
    setMessage("EA item added.");
  }

  function updateDueDate(id: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, dueDate: value }
          : item,
      ),
    );
  }

  function updateDescription(id: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            description: value,
            status: "Open",
            closedAt: undefined,
          }
          : item,
      ),
    );

    setMessage(
      "Description updated. The item remains open until closed by EA.",
    );
  }

  function updateComments(id: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, comments: value }
          : item,
      ),
    );
  }

  function closeItem(id: string) {
    const item = items.find((entry) => entry.id === id);

    if (!item || !item.description.trim()) {
      setMessage("The item needs a description before it can be closed.");
      return;
    }

    setItems((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
            ...entry,
            status: "Closed",
            closedAt: new Date().toISOString(),
          }
          : entry,
      ),
    );

    setMessage("EA item closed locally.");
  }

  function reopenItem(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            status: "Open",
            closedAt: undefined,
          }
          : item,
      ),
    );

    setMessage("EA item reopened.");
  }

  return (
    <section>
      <div className="session-heading">
        <div>
          <h2>EA assessment</h2>

          <p>
            Demand #{project.demandId}
            {" · "}
            Assigned EA: {project.assignedEA}
          </p>
        </div>

        <Button onClick={onOpenReviewSession}>
          Open review meeting
        </Button>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Record EA requirements and pending work in one list.
          Closing an item does not grant EA approval or authorize
          a risk exception. Records are local and are cleared
          when this workspace is unmounted or the page is refreshed.
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
                <summary>Read accepted meeting review</summary>

                <pre className="intake-source-text">
                  {acceptedReview.text}
                </pre>
              </details>

              <p className="workspace-secondary">
                Use this review as a reference when recording
                EA requirements or pending items below.
              </p>
            </>
          ) : (
            <p className="session-body-text">
              Accept a review under Review meeting
              to see it here. You can add EA items without an
              accepted meeting review.
            </p>
          )}
        </div>
      </section>

      <section className="content-panel ea-record-list">
        <div className="panel-heading">
          <h2>EA requirements & pending items</h2>

          <div className="workspace-tags">
            <Badge appearance="tint" color="warning">
              {openCount} open
            </Badge>

            <Badge appearance="tint" color="success">
              {closedCount} closed
            </Badge>
          </div>
        </div>

        <div className="workspace-panel-body">
          <p className="workspace-secondary">
            Record a requirement, design concern, or outstanding
            action. For example: “Update the diagram to show
            the SharePoint destination and encrypted data flows.”
          </p>


          <div className="ea-create-item">
            <h3>Add an EA requirement or pending item</h3>

            <label className="session-field">
              Description
              <Textarea
                value={description}
                rows={4}
                placeholder="Describe the EA requirement or pending item…"
                onChange={(_, data) => setDescription(data.value)}
              />
            </label>

            <label className="session-field">
              Due date (optional)
              <Input
                type="date"
                value={dueDate}
                onChange={(_, data) => setDueDate(data.value)}
              />
            </label>

            <p className="workspace-secondary">
              Action owner: {project.assignedEA}
            </p>

            <Button
              appearance="primary"
              disabled={!description.trim()}
              onClick={addItem}
            >
              Add EA item
            </Button>
          </div>

          <p
            className="workspace-secondary"
            role="status"
          >
            {message}
          </p>

          {items.length === 0 ? (
            <p className="session-body-text">
              No EA items recorded yet.
            </p>
          ) : (
            items.map((item, index) => (
              <article
                key={item.id}
                className="ea-record"
              >
                <div className="panel-heading">
                  <h3>EA-{index + 1}</h3>

                  <Badge
                    appearance="tint"
                    color={
                      item.status === "Closed"
                        ? "success"
                        : "warning"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>

                <label className="session-field">
                  Description
                  <Textarea
                    value={item.description}
                    rows={3}
                    onChange={(_, data) =>
                      updateDescription(item.id, data.value)
                    }
                  />
                </label>
                <label className="session-field">
                  Due date (optional)
                  <Input
                    type="date"
                    value={item.dueDate}
                    onChange={(_, data) =>
                      updateDueDate(item.id, data.value)
                    }
                  />
                </label>

                <p className="workspace-secondary">
                  Action owner: {project.assignedEA}
                </p>
                <label className="session-field">
                  EA comments (optional)
                  <Textarea
                    value={item.comments}
                    rows={3}
                    placeholder="Record agreements, changes, or how the item was completed…"
                    onChange={(_, data) =>
                      updateComments(item.id, data.value)
                    }
                  />
                </label>

                <p className="workspace-secondary">
                  Added:{" "}
                  {new Date(item.createdAt).toLocaleString()}

                  {item.closedAt && (
                    <>
                      {" · "}
                      Closed:{" "}
                      {new Date(item.closedAt).toLocaleString()}
                    </>
                  )}
                </p>

                <div className="meeting-review-actions">
                  {item.status === "Open" ? (
                    <Button
                      appearance="primary"
                      disabled={!item.description.trim()}
                      onClick={() => closeItem(item.id)}
                    >
                      Mark closed
                    </Button>
                  ) : (
                    <Button
                      appearance="secondary"
                      onClick={() => reopenItem(item.id)}
                    >
                      Reopen item
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <ArchitectureDiagrams
        key={project.demandId}
        project={project}
        acceptedReview={acceptedReview}
        onCurrentDiagramChange={setCurrentDiagram}
      />

      <EAApprovalReport
        key={`ea-report-${project.demandId}`}
        project={project}
        items={items}
        currentDiagram={currentDiagram}
      />

      <p className="workspace-secondary">
        Editing a closed item’s description reopens it.
        Comments can be updated without changing its status.
        Formal EA approval will be recorded separately.
        Only Security authorizes exceptions.
      </p>
    </section>
  );
}
