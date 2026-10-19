import { useState } from "react";
import MeetingReview from "./MeetingReview";
import type { AcceptedMeetingReview } from "./types";

import type { ReviewerCorrection } from "./MeetingReview";
import type { TranscriptAttachment } from "./TranscriptUpload";
import MeetingPreparation from "./MeetingPreparation";
import type { PreparedQuestion } from "./MeetingPreparation";

import {
  Badge,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Textarea,
} from "@fluentui/react-components";

import MeetingCapture from "./MeetingCapture";
import TranscriptUpload from "./TranscriptUpload";

import type { CaptureMode } from "./MeetingCapture";
import type { Project } from "./types";

import PreparationChat from "./PreparationChat";
import type { PreparationChatMessage } from "./PreparationChat";

interface ReviewSessionProps {
  project: Project;
  onAcceptedReviewChange: (
    review: AcceptedMeetingReview | null,
  ) => void;
}

type MeetingPhase =
  | "Prepare"
  | "Conduct meeting"
  | "Review meeting";

type ReviewFocus = "Joint" | "EA" | "Security" | "RAI";

interface DiscussionEntry {
  id: number;
  question: string;
  answer: string;
  speaker: string;
  focus: ReviewFocus;
  capturedAt: string;
  captureMode: Exclude<CaptureMode, "live">;
}

interface Suggestion {
  question: string;
  reason: string;
}


function captureModeLabel(
  mode: Exclude<CaptureMode, "live">,
): string {
  return mode === "dictated"
    ? "Dictated summary"
    : "Manual notes";
}

function suggestFollowUp(
  answer: string,
  focus: ReviewFocus,
): Suggestion {
  // Temporary UI simulation.
  // Replace with a FastAPI / Foundry request later.
  const text = answer.toLowerCase();

  if (focus === "Security") {
    return {
      question:
        "Which identities access the data, and how are permissions and credentials managed?",
      reason:
        "Clarify identity and access controls for the described solution.",
    };
  }

  if (focus === "RAI") {
    return {
      question:
        "What decisions or actions depend on AI, and who checks its output before use?",
      reason:
        "Clarify autonomy, possible consequences, and human oversight.",
    };
  }

  if (focus === "EA") {
    return {
      question:
        "What are the source, processing, and destination systems, and who owns each?",
      reason:
        "Establish the solution boundaries and responsibilities.",
    };
  }

  if (/stor|retain|delet|temporar/.test(text)) {
    return {
      question:
        "Where is the data stored, what retention period applies, and who verifies deletion?",
      reason:
        "The answer mentions data storage or lifecycle; details need clarification.",
    };
  }

  if (/\b(api|apis|vendor|vendors|saas)\b/.test(text)) {
    return {
      question:
        "What data goes to the external service, and what usage, retention, and exit terms apply?",
      reason:
        "The answer mentions an external dependency.",
    };
  }

  if (/\b(ai|agent|agents|model|models)\b/.test(text)) {
    return {
      question:
        "Does the AI only suggest outputs, or can it perform actions, and what human checks apply?",
      reason:
        "The answer suggests AI involvement; its authority needs clarification.",
    };
  }


  return {
    question:
      "Which systems and data are needed, and what happens if the application is unavailable or incorrect?",
    reason:
      "Clarify dependencies and business impact before technical design.",
  };
}

export default function ReviewSession({
  project,
  onAcceptedReviewChange,
}: ReviewSessionProps) {
  const [phase, setPhase] = useState<MeetingPhase>("Prepare");

  const [meetingTitle, setMeetingTitle] = useState(
    `${project.name} — stakeholder review`,
  );

  const [participants, setParticipants] = useState("");
  const [focus, setFocus] = useState<ReviewFocus>("Joint");

  const [captureMode, setCaptureMode] =
    useState<CaptureMode>("manual");

  const [currentQuestion, setCurrentQuestion] = useState("");

  const [answer, setAnswer] = useState("");
  const [speaker, setSpeaker] = useState("");

  const [entries, setEntries] =
    useState<DiscussionEntry[]>([]);

  const [suggestion, setSuggestion] = useState<Suggestion>({
    question:
      "Who will use the application, and how will you measure its business value?",
    reason:
      "Start with stakeholder goals and success measures.",
  });

  const [understanding, setUnderstanding] = useState("");
  const [correction, setCorrection] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);

  const [status, setStatus] = useState(
    "Awaiting stakeholder answer",
  );

  const [error, setError] = useState("");

  const liveUnavailable = captureMode === "live";
  const [transcript, setTranscript] =
    useState<TranscriptAttachment | null>(null);

  const [reviewerCorrections, setReviewerCorrections] =
    useState<ReviewerCorrection[]>([]);
  const captureStatusLabel =
    captureMode === "live"
      ? "Live transcript · Not connected"
      : captureMode === "dictated"
        ? "Dictated summary · Local draft"
        : "Manual notes · Local draft";
  const [preparedQuestions, setPreparedQuestions] =
    useState<PreparedQuestion[]>([]);
  const [activePreparedQuestionId, setActivePreparedQuestionId] =
    useState<string | null>(null);

  const [askedPreparedQuestionIds, setAskedPreparedQuestionIds] =
    useState<string[]>([]);

  const [preparationMessages, setPreparationMessages] =
    useState<PreparationChatMessage[]>([]);

  const [preparationChatDraft, setPreparationChatDraft] =
    useState("");

  const [meetingChatMessages, setMeetingChatMessages] =
    useState<PreparationChatMessage[]>([]);

  const [meetingChatDraft, setMeetingChatDraft] = useState("");

  const [additionalQuestions, setAdditionalQuestions] =
    useState<PreparedQuestion[]>([]);

  const [manualQuestionDraft, setManualQuestionDraft] = useState("");

  function captureAnswer() {
    if (captureMode === "live") {
      setError(
        "Live transcription is awaiting integration. Select manual notes or dictated summary."
      );
      return;
    }

    if (!currentQuestion.trim()) {
      setError("Enter or select a question before capturing an answer.");
      return;
    }

    if (!answer.trim()) {
      setError("Please capture an answer before continuing.");
      return;
    }

    const entry: DiscussionEntry = {
      id: entries.length + 1,
      question: currentQuestion.trim(),
      answer: answer.trim(),
      speaker: speaker.trim() || "Not recorded",
      focus,
      captureMode,
      capturedAt: new Date().toISOString(),
    };

    setEntries((current) => [...current, entry]);

    if (activePreparedQuestionId) {
      const capturedQuestionId = activePreparedQuestionId;

      setAskedPreparedQuestionIds((current) =>
        current.includes(capturedQuestionId)
          ? current
          : [...current, capturedQuestionId]
      );

      setActivePreparedQuestionId(null);
    }

    setUnderstanding(entry.answer);
    setSuggestion(suggestFollowUp(entry.answer, entry.focus));

    setAnswer("");
    setSpeaker("");
    setCorrection("");
    setShowCorrection(false);
    setError("");
    setStatus("Answer captured · Simulated suggestions updated");
  }

  function useSuggestedQuestion() {
    if (answer.trim()) {
      setError(
        "Capture or clear the current draft answer before changing the question."
      );
      return;
    }

    setCurrentQuestion(suggestion.question);
    setActivePreparedQuestionId(null);
    setStatus("Awaiting stakeholder answer");
    setError("");
  }

  function applyCorrection() {
    const correctedText = correction.trim();
    const latestEntry = entries[entries.length - 1];

    if (!correctedText) {
      setError("Enter the corrected understanding.");
      return;
    }

    if (!latestEntry) {
      setError("Capture an answer before adding a correction.");
      return;
    }

    setReviewerCorrections((current) => [
      ...current,
      {
        id: current.length + 1,
        entryId: latestEntry.id,
        text: correctedText,
        correctedAt: new Date().toISOString(),
      },
    ]);

    setUnderstanding(correctedText);
    setSuggestion(suggestFollowUp(correctedText, focus));
    setShowCorrection(false);
    setError("");

    setStatus(
      "Reviewer correction retained · Original answer preserved",
    );
  }

  function usePreparedQuestion(question: PreparedQuestion) {
    if (
      askedPreparedQuestionIds.includes(question.id) ||
      !question.question.trim()
    ) {
      return;
    }

    if (answer.trim()) {
      setError(
        "Capture or clear the current answer before choosing another question."
      );
      return;
    }

    setCurrentQuestion(question.question.trim());
    setActivePreparedQuestionId(question.id);
    setFocus(question.focus);
    setStatus("Awaiting stakeholder answer");
    setError("");
  }

  function addQuestionFromChat(question: PreparedQuestion) {
    setPreparedQuestions((current) => {
      const alreadyExists = current.some(
        (item) =>
          item.question.trim().toLowerCase() ===
          question.question.trim().toLowerCase()
      );

      if (alreadyExists) {
        return current;
      }

      return [
        ...current,
        {
          ...question,
          selected: true,
        },
      ];
    });
  }

  function addManualMeetingQuestion() {
    const text = manualQuestionDraft.trim();

    if (!text) {
      return;
    }

    setAdditionalQuestions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        focus,
        priority: "Follow-up",
        question: text,
        reason: "Added manually during the meeting.",
        selected: true,
      },
    ]);

    setManualQuestionDraft("");
  }

  function addMeetingQuestionFromChat(question: PreparedQuestion) {
    setAdditionalQuestions((current) => {
      const alreadyExists = current.some(
        (item) =>
          item.question.trim().toLowerCase() ===
          question.question.trim().toLowerCase()
      );

      if (alreadyExists) {
        return current;
      }

      return [
        ...current,
        {
          ...question,
          selected: true,
          reason: "Added from meeting chat.",
        },
      ];
    });
  }

  return (
    <section className="review-session">
      <div className="session-heading">
        <div>
          <h2>Shared review session</h2>
          <p>
            Demand #{project.demandId} · Facilitator:{" "}
            {project.assignedEA}
          </p>
        </div>

        <Badge
          appearance="tint"
          color={liveUnavailable ? "warning" : "informative"}
        >
          {captureStatusLabel}
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          AI responses are simulated. Shared-user
          synchronization, live transcription, and permanent
          storage are not connected.
        </MessageBarBody>
      </MessageBar>

      <div
        className="meeting-phase-controls"
        aria-label="Meeting phase"
      >
        {(
          [
            "Prepare",
            "Conduct meeting",
            "Review meeting",
          ] as const
        ).map((item) => (
          <Button
            key={item}
            appearance={
              phase === item ? "primary" : "secondary"
            }
            aria-pressed={phase === item}
            onClick={() => setPhase(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      {phase === "Prepare" && (
        <div className="session-grid preparation-layout">
          {/* LEFT: AI-generated questions and meeting preparation */}
          <section className="content-panel">
            <div className="panel-heading">
              <h2>Prepare the interview</h2>
            </div>

            <div className="workspace-panel-body">
              <label className="session-field">
                Meeting title
                <Input
                  value={meetingTitle}
                  onChange={(_, data) => setMeetingTitle(data.value)}
                />
              </label>

              <label className="session-field">
                Participants / roles (optional)
                <Textarea
                  value={participants}
                  placeholder="EA, business stakeholders, Security, RAI, delivery team…"
                  onChange={(_, data) => setParticipants(data.value)}
                />
              </label>

              <MeetingPreparation
                project={project}
                questions={preparedQuestions}
                onQuestionsChange={setPreparedQuestions}
              />

              <p className="workspace-secondary">
                Select the questions you want to ask. They will appear
                in Conduct meeting with a Use question button.
              </p>

              <Button
                appearance="primary"
                onClick={() => setPhase("Conduct meeting")}
              >
                Start meeting
              </Button>
            </div>
          </section>

          {/* RIGHT: Preparation chat and collapsible project context */}
          <section className="content-panel">
            <div className="panel-heading">
              <h2>Preparation AI assistant</h2>

              <Badge appearance="tint" color="warning">
                Simulation
              </Badge>
            </div>

            <div className="workspace-panel-body">
              <details className="preparation-project-context">
                <summary>Project context</summary>

                <p>
                  <strong>Project:</strong> {project.name}
                </p>

                <p>
                  <strong>Demand:</strong> #{project.demandId}
                </p>

                <p>
                  <strong>Business function:</strong>{" "}
                  {project.businessFunction}
                </p>

                <p>
                  <strong>EA complexity:</strong>{" "}
                  {project.eaComplexity}
                </p>

                <p>
                  <strong>Original intake:</strong>{" "}
                  {project.intakeSource
                    ? "Markdown retained with this project"
                    : "Sample project fields only"}
                </p>

                <p className="workspace-secondary">
                  Full intake and previous meeting evidence will be
                  available to the agent after backend integration.
                </p>
              </details>

              <PreparationChat
                project={project}
                messages={preparationMessages}
                draft={preparationChatDraft}
                questions={preparedQuestions}
                onMessagesChange={setPreparationMessages}
                onDraftChange={setPreparationChatDraft}
                onAddQuestion={addQuestionFromChat}
              />
            </div>
          </section>
        </div>
      )}

      {phase === "Conduct meeting" && (
        <div className="session-grid">
          <section className="content-panel">
            <div className="panel-heading">
              <h2>Discussion & answers</h2>
            </div>

            <div className="workspace-panel-body">
              <MeetingCapture
                mode={captureMode}
                onChange={(mode) => {
                  setCaptureMode(mode);
                  setError("");
                }}
              />
              <section className="meeting-question-list">
                <h3>Prepared questions</h3>

                <p className="muted-text">
                  Choose a question, ask it, and capture the answer. Captured questions
                  are marked as asked.
                </p>

                {preparedQuestions.filter(
                  (question) => question.selected === true && question.question.trim()
                ).length === 0 ? (
                  <p>No questions selected. You can still enter your own question below.</p>
                ) : (
                  preparedQuestions
                    .filter(
                      (question) =>
                        question.selected === true && question.question.trim()
                    )
                    .map((question) => {
                      const asked = askedPreparedQuestionIds.includes(question.id);
                      const active = activePreparedQuestionId === question.id && !asked;

                      return (
                        <div className="meeting-question-row" key={question.id}>
                          <div>
                            <Badge appearance="tint">{question.focus}</Badge>
                            <p>{question.question}</p>
                          </div>

                          <Button
                            appearance={active ? "primary" : "secondary"}
                            disabled={asked || active}
                            onClick={() => usePreparedQuestion(question)}
                          >
                            {asked ? "Asked" : active ? "Current question" : "Use question"}
                          </Button>
                        </div>
                      );
                    })
                )}
              </section>
              <section className="meeting-question-list">
                <h3>Additional questions</h3>

                <p className="workspace-secondary">
                  Add questions during the discussion. Your prepared questions
                  remain unchanged.
                </p>

                <label className="session-field">
                  Add a question manually
                  <Textarea
                    value={manualQuestionDraft}
                    rows={2}
                    placeholder="Enter a question to ask during this meeting…"
                    onChange={(_, data) => setManualQuestionDraft(data.value)}
                  />
                </label>

                <Button
                  appearance="secondary"
                  disabled={!manualQuestionDraft.trim()}
                  onClick={addManualMeetingQuestion}
                >
                  Add question
                </Button>

                <p className="workspace-secondary">
                  New manual questions use the currently selected reviewer focus:
                  {" "}
                  <strong>{focus}</strong>.
                </p>

                {additionalQuestions.map((question) => {
                  const asked = askedPreparedQuestionIds.includes(question.id);
                  const active =
                    activePreparedQuestionId === question.id && !asked;

                  return (
                    <div className="meeting-question-row" key={question.id}>
                      <div>
                        <Badge appearance="tint">{question.focus}</Badge>
                        <p>{question.question}</p>
                      </div>

                      <Button
                        appearance={active ? "primary" : "secondary"}
                        disabled={asked || active}
                        onClick={() => usePreparedQuestion(question)}
                      >
                        {asked
                          ? "Asked"
                          : active
                            ? "Current question"
                            : "Use question"}
                      </Button>
                    </div>
                  );
                })}
              </section>
              <div className="session-current-question">
                <span>CURRENT QUESTION</span>
                <p>
                  {currentQuestion ||
                    "Click ‘Use question’ beside a question to begin."}
                </p>
              </div>

              <label className="session-field">
                Respondent / source (optional)
                <Input
                  value={speaker}
                  placeholder="Leave blank, or enter a person or role"
                  onChange={(_, data) => setSpeaker(data.value)}
                />
              </label>

              <label className="session-field">
                {captureMode === "dictated"
                  ? "Dictate and check the stakeholder answer summary"
                  : "Stakeholder’s answer"}

                <Textarea
                  value={answer}
                  rows={5}
                  disabled={liveUnavailable || !currentQuestion.trim()}
                  placeholder={
                    captureMode === "dictated"
                      ? "Click here, press Win + H, and dictate your summary…"
                      : "Type or paste the answer to the current question…"
                  }
                  onChange={(_, data) =>
                    setAnswer(data.value)
                  }
                />
              </label>

              <Button
                appearance="primary"
                disabled={liveUnavailable || !currentQuestion.trim()}
                onClick={captureAnswer}
              >
                Capture & analyze answer
              </Button>

              <p
                className="workspace-secondary"
                role="status"
              >
                {status}
              </p>

              {error && (
                <p className="session-error" role="alert">
                  {error}
                </p>
              )}

              <details className="session-history">
                <summary>
                  Discussion history ({entries.length} answers)
                </summary>

                {entries.length === 0 ? (
                  <p className="workspace-secondary">
                    No answers captured yet.
                  </p>
                ) : (
                  entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="session-history-entry"
                    >
                      <strong>{entry.question}</strong>
                      <p>{entry.answer}</p>

                      <small>
                        {entry.speaker} · {entry.focus} ·{" "}
                        {captureModeLabel(entry.captureMode)}
                        {" · "}
                        {new Date(
                          entry.capturedAt,
                        ).toLocaleTimeString()}
                        {" · "}Unconfirmed notes
                      </small>
                    </article>
                  ))
                )}
              </details>
            </div>
          </section>

          <section className="content-panel">
            <div className="panel-heading">
              <h2>AI Review Copilot</h2>

              <Badge appearance="tint" color="warning">
                Simulation
              </Badge>
            </div>

            <div className="workspace-panel-body">

              <label className="session-field">
                Focus for the next answer analysis
                <Select
                  value={focus}
                  onChange={(_, data) =>
                    setFocus(data.value as ReviewFocus)
                  }
                >
                  <option>Joint</option>
                  <option>EA</option>
                  <option>Security</option>
                  <option>RAI</option>
                </Select>
              </label>

              <PreparationChat
                project={project}
                messages={meetingChatMessages}
                draft={meetingChatDraft}
                questions={[...preparedQuestions, ...additionalQuestions]}
                onMessagesChange={setMeetingChatMessages}
                onDraftChange={setMeetingChatDraft}
                onAddQuestion={addMeetingQuestionFromChat}
                inputLabel="Ask the meeting assistant"
                emptyMessage="Ask for help with a stakeholder answer or request a follow-up question."
                footerText="Demo replies use the message you send. Automatic analysis of captured answers and conversation history awaits Foundry integration. Added questions appear under Additional questions."
              />


            </div>
          </section>
        </div>
      )}

      {phase === "Review meeting" && (
        <section className="content-panel">
          <div className="panel-heading">
            <h2>Meeting record</h2>
          </div>

          <div className="workspace-panel-body">
            <p className="session-body-text">
              <strong>{meetingTitle}</strong>
            </p>

            <p className="session-body-text">
              Participants: {participants || "Not recorded"}
            </p>

            <p className="session-body-text">
              Captured answers: {entries.length}
            </p>

            {entries.length === 0 && (
              <p className="workspace-secondary">
                No answers captured yet. You can still attach
                the meeting transcript below.
              </p>
            )}

            {entries.map((entry) => (
              <article
                key={entry.id}
                className="session-history-entry"
              >
                <strong>{entry.question}</strong>
                <p>{entry.answer}</p>

                <small>
                  Source: {entry.speaker}
                  {" · "}
                  {captureModeLabel(entry.captureMode)}
                  {" · "}Unconfirmed notes
                </small>
              </article>
            ))}

            <p className="workspace-secondary">
              Captured answers are discussion notes, not verified
              controls or formal approvals. Attach the meeting
              transcript below to retain the original discussion.
            </p>
          </div>
        </section>
      )}

      {/* Keep mounted so attachments survive phase changes. */}
      <div hidden={phase !== "Review meeting"}>
        <TranscriptUpload
          onAttachmentChange={setTranscript}
        />

        <MeetingReview
          projectName={project.name}
          entries={entries}
          corrections={reviewerCorrections}
          transcript={transcript}
          onAcceptedReviewChange={onAcceptedReviewChange}
        />
      </div>
    </section>
  );
}