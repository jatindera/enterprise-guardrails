import { useEffect, useState } from "react";

import type { AcceptedMeetingReview } from "./types";
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

interface CapturedAnswer {
  id: number;
  question: string;
  answer: string;
  speaker: string;
}

export interface ReviewerCorrection {
  id: number;
  entryId: number;
  text: string;
  correctedAt: string;
}

interface TranscriptSource {
  fileName: string;
  text: string;
}

interface MeetingReviewProps {
  projectName: string;
  assessmentName?: string;
  entries: CapturedAnswer[];
  corrections: ReviewerCorrection[];
  transcript: TranscriptSource | null;
  onAcceptedReviewChange: (
    review: AcceptedMeetingReview | null,
  ) => void;
}

type ReviewStatus = "Not generated" | "Draft" | "Accepted";

export default function MeetingReview({
  projectName,
  assessmentName = "assessment",
  entries,
  corrections,
  transcript,
  onAcceptedReviewChange,
}: MeetingReviewProps) {
  const [reviewText, setReviewText] = useState("");
  const [reviewedSnapshot, setReviewedSnapshot] = useState("");
  const [reviewStatus, setReviewStatus] =
    useState<ReviewStatus>("Not generated");

  const [message, setMessage] = useState("");

  const currentSnapshot = JSON.stringify({
    projectName,
    entries,
    corrections,
    transcript,
  });

  const stale =
    reviewedSnapshot !== "" &&
    reviewedSnapshot !== currentSnapshot;

  useEffect(() => {
    if (stale) {
      onAcceptedReviewChange(null);
    }
  }, [stale, onAcceptedReviewChange]);

  const hasEvidence =
    entries.length > 0 || Boolean(transcript?.text.trim());

  function reviewMeeting() {
    onAcceptedReviewChange(null);
    if (!hasEvidence) return;

    const answerNotes = entries.length
      ? entries
        .map(
          (entry) =>
            `[Answer ${entry.id} · ${entry.speaker}]\n` +
            `Question: ${entry.question}\n` +
            `Recorded answer: ${entry.answer}`,
        )
        .join("\n\n")
      : "No manually captured answers.";

    const correctionNotes = corrections.length
      ? corrections
        .map(
          (correction) =>
            `[Correction ${correction.id} → Answer ${correction.entryId}]\n` +
            correction.text,
        )
        .join("\n\n")
      : "No reviewer corrections recorded.";

    const transcriptNote = transcript
      ? `Attached: ${transcript.fileName}\n` +
      "The transcript is available as an input. Full transcript " +
      "analysis requires the connected backend agent."
      : "No transcript attached. Review is based on captured notes.";

    const text = [
      `MEETING REVIEW — ${projectName}`,

      "DEMO OUTPUT\n" +
      "This preview assembles recorded evidence and a review " +
      "checklist. No actual AI synthesis or contradiction detection " +
      "has been performed.",

      "1. RECORDED DISCUSSION\n" + answerNotes,

      "2. REVIEWER CORRECTIONS\n" + correctionNotes,

      "3. TRANSCRIPT EVIDENCE\n" + transcriptNote,

      "4. REQUIREMENTS TO CONFIRM\n" +
      "Identify which recorded statements should become project " +
      "requirements. Preserve their source references and confirm " +
      "their meaning with the relevant stakeholder.",

      "5. GAPS AND CONTRADICTIONS TO CHECK\n" +
      "Compare the discussion with intake, previous decisions, " +
      "and technical evidence. Missing information remains " +
      "unresolved rather than assumed compliant.",

      "6. DOMAIN FOLLOW-UP\n" +
      "EA: confirm source, processing, destination, and ownership.\n" +
      "Security: confirm identity, data handling, and evidence.\n" +
      "RAI: confirm AI actions, output checking, and potential " +
      "impact where applicable.",

      "7. PROPOSED NEXT STEPS\n" +
      "Confirm unresolved statements and identify supporting " +
      "evidence. Assign owners and deadlines explicitly; none " +
      "are inferred by this demo.",

      "8. NEXT-MEETING QUESTION\n" +
      "Which statements remain unconfirmed, who can confirm " +
      "them, and what evidence should they provide?",
    ].join("\n\n");

    setReviewText(text);
    setReviewedSnapshot(currentSnapshot);
    setReviewStatus("Draft");

    setMessage(
      "Consolidated demo review prepared. Edit it as needed, then accept the local draft.",
    );
  }

  function acceptReview() {
    if (stale || !reviewText.trim()) return;

    onAcceptedReviewChange({
      text: reviewText.trim(),
      acceptedAt: new Date().toISOString(),
    });

    setReviewStatus("Accepted");

    setMessage(
      `Review accepted into the local project workspace. It is now available under ${assessmentName} as supporting evidence.`,
    );
  }

  return (
    <section className="content-panel meeting-review-panel">
      <div className="panel-heading">
        <h2>AI meeting review</h2>

        <Badge
          appearance="tint"
          color={
            stale
              ? "warning"
              : reviewStatus === "Accepted"
                ? "success"
                : "informative"
          }
        >
          {stale ? "Out of date" : reviewStatus}
        </Badge>
      </div>

      <div className="workspace-panel-body">
        <p className="session-body-text">
          Review the meeting notes, corrections, and transcript
          together in one consolidated assessment.
        </p>

        <p className="workspace-secondary">
          Inputs: {entries.length} captured answers ·{" "}
          {corrections.length} corrections · Transcript:{" "}
          {transcript?.fileName || "Not attached"}
        </p>

        <div className="meeting-review-actions">
          <Button
            appearance="primary"
            disabled={!hasEvidence}
            onClick={reviewMeeting}
          >
            {reviewedSnapshot
              ? "Regenerate review"
              : "Review meeting with AI"}
          </Button>
        </div>

        {!hasEvidence && (
          <p className="workspace-secondary">
            Capture an answer or attach a transcript first.
            Notes-only review is supported.
          </p>
        )}

        <MessageBar intent="info">
          <MessageBarBody>
            Demo analysis only. The connected agent will produce
            the actual consolidated review in this same area.
          </MessageBarBody>
        </MessageBar>

        {stale && (
          <div className="intake-message">
            <MessageBar intent="warning">
              <MessageBarBody>
                Meeting evidence changed. Regenerate before
                accepting this review. Regeneration replaces
                the text and any edits in this local draft.
              </MessageBarBody>
            </MessageBar>
          </div>
        )}

        {reviewedSnapshot && (
          <>
            <label
              className="session-field consolidated-review-field"
            >
              Consolidated review
              <Textarea
                value={reviewText}
                rows={20}
                resize="vertical"
                onChange={(_, data) => {
                  setReviewText(data.value);
                  setReviewStatus("Draft");
                  onAcceptedReviewChange(null);

                  setMessage(
                    `Review edited. Accept it again to make the revised version available to ${assessmentName}.`,
                  );
                }}
              />
            </label>

            <div className="meeting-review-actions">
              <Button
                appearance="primary"
                disabled={
                  stale ||
                  !reviewText.trim() ||
                  reviewStatus === "Accepted"
                }
                onClick={acceptReview}
              >
                Accept review draft
              </Button>
            </div>
          </>
        )}

        <p className="workspace-secondary" role="status">
          {message}
        </p>

        <p className="workspace-secondary">
          Acceptance records this review locally only.
          It does not verify controls or issue approval.
          Regeneration replaces the current draft; permanent
          version history will follow backend integration.
        </p>
      </div>
    </section>
  );
}