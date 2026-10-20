import { deploymentBlocker } from "./projectWorkflow";
import { useProjectUpdate } from "./ProjectUpdates";
import { useState } from "react";

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

type ProductionStatus = "Not deployed" | "In production";

type LeanIXStatus = "Not planned" | "Planned" | "Submitted";

interface ProductionRecordData {
  productionStatus: ProductionStatus;
  goLiveDate: string;
  leanixStatus: LeanIXStatus;
  leanixId: string;
  leanixUrl: string;
  comments: string;
  savedAt: string;
}

interface ProductionRecordProps {
  project: Project;
}

function isValidWebUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function ProductionRecord({
  project,
}: ProductionRecordProps) {
  const updateProject = useProjectUpdate(project.demandId);
  const [productionStatus, setProductionStatus] =
    useState<ProductionStatus>(
      project.productionStatus === "In production" || project.stage === "Production"
        ? "In production"
        : "Not deployed",
    );

  const [goLiveDate, setGoLiveDate] = useState(project.goLiveDate ?? "");

  const [leanixStatus, setLeanIXStatus] =
    useState<LeanIXStatus>(project.leanixStatus ?? "Not planned");

  const [leanixId, setLeanIXId] = useState(project.leanixId ?? "");
  const [leanixUrl, setLeanIXUrl] = useState(project.leanixUrl ?? "");
  const [comments, setComments] = useState(project.productionComments ?? "");

  const [savedRecord, setSavedRecord] =
    useState<ProductionRecordData | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const today = new Date();
  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  function markChanged() {
    setError("");
    setMessage("");
  }

  function saveRecord() {
    setError("");
    setMessage("");

    if (productionStatus === "In production") {
      const blocker = deploymentBlocker(project);
      if (blocker) {
        setError(blocker);
        return;
      }
      if (!goLiveDate) {
        setError("Enter the actual go-live date.");
        return;
      }

      if (goLiveDate > localToday) {
        setError("The actual go-live date cannot be in the future.");
        return;
      }
    }

    if (leanixUrl.trim() && !isValidWebUrl(leanixUrl.trim())) {
      setError(
        "Enter a valid LeanIX link starting with https:// or http://.",
      );
      return;
    }

    if (leanixStatus === "Submitted") {
      if (productionStatus !== "In production") {
        setError(
          "Mark the project as In production before recording its LeanIX submission.",
        );
        return;
      }

      if (!leanixId.trim() && !leanixUrl.trim()) {
        setError(
          "Enter a LeanIX ID or link for the submitted record.",
        );
        return;
      }
    }

    const record: ProductionRecordData = {
      productionStatus,
      goLiveDate:
        productionStatus === "In production" ? goLiveDate : "",
      leanixStatus,
      leanixId: leanixId.trim(),
      leanixUrl: leanixUrl.trim(),
      comments: comments.trim(),
      savedAt: new Date().toISOString(),
    };

    updateProject({
      productionStatus: record.productionStatus,
      goLiveDate: record.goLiveDate,
      leanixStatus: record.leanixStatus,
      leanixId: record.leanixId,
      leanixUrl: record.leanixUrl,
      productionComments: record.comments,
      productionSavedAt: record.savedAt,
    });
    setSavedRecord(record);
    setMessage("Production and LeanIX details saved in this workspace.");
  }

  return (
    <section className="production-record">
      <div className="session-heading">
        <div>
          <h3 className="session-subheading">
            Production &amp; LeanIX
          </h3>

          <p>
            {project.name} · Demand {project.demandId}
          </p>
        </div>

        <Badge appearance="tint" color="brand">
          {savedRecord?.productionStatus ?? "Not recorded"}
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Record the actual deployment and optional LeanIX registration.
          Saving here records information; it does not deploy the
          application or submit it to LeanIX. Frontend gate validation is connected; backend persistence is pending.
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

      <section className="production-record-panel">
        <h3 className="session-subheading">Production deployment</h3>

        <label className="session-field">
          Production status
          <Select
            value={productionStatus}
            onChange={(_, data) => {
              setProductionStatus(
                data.value as ProductionStatus,
              );
              markChanged();
            }}
          >
            <option value="Not deployed">Not deployed</option>
            <option value="In production">In production</option>
          </Select>
        </label>

        {productionStatus === "In production" && (
          <label className="session-field">
            Actual go-live date
            <Input
              type="date"
              value={goLiveDate}
              max={localToday}
              onChange={(_, data) => {
                setGoLiveDate(data.value);
                markChanged();
              }}
            />
          </label>
        )}
      </section>

      <section className="production-record-panel production-record-panel--leanix">
        <h3 className="session-subheading">LeanIX registration</h3>

        <p className="workspace-secondary">
          Register selected production applications in LeanIX and
          record their reference here.
        </p>

        <label className="session-field">
          LeanIX status
          <Select
            value={leanixStatus}
            onChange={(_, data) => {
              setLeanIXStatus(data.value as LeanIXStatus);
              markChanged();
            }}
          >
            <option value="Not planned">Not planned</option>
            <option value="Planned">Planned</option>
            <option value="Submitted">Submitted</option>
          </Select>
        </label>

        <label className="session-field">
          LeanIX ID — optional unless no link is provided
          <Input
            value={leanixId}
            placeholder="Enter the LeanIX record ID"
            onChange={(_, data) => {
              setLeanIXId(data.value);
              markChanged();
            }}
          />
        </label>

        <label className="session-field">
          LeanIX link
          <Input
            type="url"
            value={leanixUrl}
            placeholder="https://..."
            onChange={(_, data) => {
              setLeanIXUrl(data.value);
              markChanged();
            }}
          />
        </label>

        {savedRecord?.leanixStatus === "Submitted" &&
          savedRecord.leanixUrl && (
            <a
              href={savedRecord.leanixUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open saved LeanIX record
            </a>
          )}
      </section>

      <section className="production-record-panel">
        <label className="session-field">
          Comments
          <Textarea
            value={comments}
            rows={4}
            placeholder="Add deployment notes or explain why LeanIX registration is planned or not required."
            onChange={(_, data) => {
              setComments(data.value);
              markChanged();
            }}
          />
        </label>

        <Button appearance="primary" onClick={saveRecord}>
          Save production details
        </Button>

        {savedRecord && (
          <p className="workspace-secondary">
            Last saved:{" "}
            {new Date(savedRecord.savedAt).toLocaleString()}
          </p>
        )}
      </section>

      <p className="workspace-secondary">
        These details remain available while this project workspace
        stays mounted. Refreshing clears them until backend storage is connected.
      </p>
    </section>
  );
}