import { useMeetingPersistence } from "./meetings/useMeetingPersistence";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthGate";
import { preparationAccess, canEditPreparationFocus } from "./auth/preparationAccess";
import type { PreparationScope } from "./auth/preparationAccess";
import MeetingReview from "./MeetingReview";
import EAMeetingReview from "./EAMeetingReview";
import type { AcceptedMeetingReview } from "./types";

import type { ReviewerCorrection } from "./MeetingReview";
import type { TranscriptAttachment } from "./TranscriptUpload";
import MeetingPreparation from "./MeetingPreparation";
import type { PreparedQuestion } from "./MeetingPreparation";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

import TranscriptUpload from "./TranscriptUpload";

import type { CaptureMode } from "./MeetingCapture";
import type { Project } from "./types";
import ProjectIntakeDetails from "./ProjectIntakeDetails";

import PreparationChat from "./PreparationChat";
import type { PreparationChatMessage } from "./PreparationChat";

interface ReviewSessionProps {
  project: Project;
  heading?: string;
  facilitatorName?: string;
  preparationDomain?: Exclude<PreparationScope, "All">;
  canEditOverride?: boolean;
  onAcceptedReviewChange: (
    review: AcceptedMeetingReview | null,
  ) => void;
  // The host supplies an optional fourth panel; meeting logic stays reusable.
  assessmentTab?: {
    label: string;
    render: (openReviewMeeting: () => void) => ReactNode;
  };
}

type MeetingPhase =
  | "Prepare"
  | "Conduct meeting"
  | "Review meeting"
  | "Assessment";

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

function captureModeLabel(
  mode: Exclude<CaptureMode, "live">,
): string {
  return mode === "dictated"
    ? "Dictated summary"
    : "Manual notes";
}

export default function ReviewSession({
  project,
  facilitatorName = project.assignedEA,
  preparationDomain = "EA",
  canEditOverride,
  onAcceptedReviewChange,
  assessmentTab,
}: ReviewSessionProps) {
  const access = preparationAccess(useAuth().roles);
  const preparationScope = preparationDomain;
  const roleCanPrepare = canEditPreparationFocus(access, preparationDomain) && (canEditOverride ?? true);
  const [phase, setPhase] = useState<MeetingPhase>("Prepare");

  const [focus, setFocus] = useState<ReviewFocus>(preparationDomain);
  const [captureMode] =
    useState<CaptureMode>("manual");

  const [currentQuestion, setCurrentQuestion] = useState("");

  const [entries, setEntries] =
    useState<DiscussionEntry[]>([]);

  const liveUnavailable = captureMode === "live";
  const [transcripts, setTranscripts] =
    useState<TranscriptAttachment[]>([]);

  const [reviewerCorrections] =
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
  const [starting, setStarting] = useState(false);
  const persistence = useMeetingPersistence(project.demandId, preparationDomain, {
    preparedQuestions, additionalQuestions, currentQuestionId: activePreparedQuestionId,
    askedQuestionIds: askedPreparedQuestionIds,
  }, (value) => {
    setPreparedQuestions(value.preparedQuestions);
    setAdditionalQuestions(value.additionalQuestions);
    setActivePreparedQuestionId(value.currentQuestionId);
    setAskedPreparedQuestionIds(value.askedQuestionIds);
    const questions = [...value.preparedQuestions, ...value.additionalQuestions];
    setCurrentQuestion(questions.find(q => q.id === value.currentQuestionId)?.question ?? "");
    setEntries(value.askedQuestionIds.map((id, index) => {
      const question = questions.find(q => q.id === id)!;
      return {id: index + 1, question: question.question, answer: "", speaker: "Not recorded",
        focus: question.focus, capturedAt: value.askedAt[id], captureMode: "manual"};
    }));
  });
  const canPrepare = roleCanPrepare && persistence.ready && persistence.canEdit && !starting;

  async function changePhase(next: MeetingPhase) {
    if (next !== "Conduct meeting") { setPhase(next); return; }
    if (!persistence.ready || starting) return;
    setStarting(true);
    try {
      await persistence.flush();
      setPhase(next);
    } catch { /* Save/load error is displayed beside the persistence status. */ }
    finally { setStarting(false); }
  }


  function usePreparedQuestion(question: PreparedQuestion) {
    const questionText = question.question.trim();

    if (
      !canPrepare || !questionText ||
      askedPreparedQuestionIds.includes(question.id)
    ) {
      return;
    }

    setCurrentQuestion(questionText);
    setActivePreparedQuestionId(question.id);
    setFocus(question.focus);

    const entry: DiscussionEntry = {
      id: entries.length + 1,
      question: questionText,
      answer: "",
      speaker: "Not recorded",
      focus: question.focus,
      capturedAt: new Date().toISOString(),
      captureMode: "manual",
    };

    setEntries((current) => [...current, entry]);

    setAskedPreparedQuestionIds((current) => [
      ...current,
      question.id,
    ]);
  }

  function addQuestionFromChat(question: PreparedQuestion) {
    if (!canPrepare || question.focus !== preparationScope) return;
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
          selected: false,
        },
      ];
    });
  }

  function addManualMeetingQuestion() {
    if (!canPrepare) return;
    const text = manualQuestionDraft.trim();

    if (!text || [...preparedQuestions, ...additionalQuestions].some(q =>
      q.question.trim().toLowerCase() === text.toLowerCase())) return;

    setAdditionalQuestions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        focus,
        priority: "Follow-up",
        question: text,
        reason: "Added manually during the meeting.",
        source: "manual",
        selected: true,
      },
    ]);

    setManualQuestionDraft("");
  }

  function addMeetingQuestionFromChat(question: PreparedQuestion) {
    if (!canPrepare || question.focus !== preparationDomain || preparedQuestions.some(q =>
      q.question.trim().toLowerCase() === question.question.trim().toLowerCase())) return;
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
          reason: question.reason || "Added from meeting chat.",
        },
      ];
    });
  }

  return (
    <section className="review-session">
      <div className="session-heading">
        <div>
          <p>
            Demand #{project.demandId} · Facilitator:{" "}
            {facilitatorName}
          </p>
        </div>

        <Badge
          appearance="tint"
          color={liveUnavailable ? "warning" : "informative"}
        >
          {captureStatusLabel}
        </Badge>
      </div>



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
            disabled={starting || (item === "Conduct meeting" && !persistence.ready)}
            onClick={() => { void changePhase(item); }}
          >
            {item}
          </Button>
        ))}
        {assessmentTab && (
          <Button
            appearance={phase === "Assessment" ? "primary" : "secondary"}
            aria-pressed={phase === "Assessment"}
            onClick={() => setPhase("Assessment")}
          >
            {assessmentTab.label}
          </Button>
        )}
      </div>

      <div className="meeting-review-actions" aria-live="polite">
        <span>{persistence.ready ? `Meeting questions · ${persistence.status}` : persistence.error ? "Questions unavailable" : "Loading saved questions…"}</span>
        {persistence.error && <span role="alert">{persistence.error}</span>}
        {persistence.ready && persistence.error && persistence.status !== "Conflict" &&
          <Button onClick={() => { void persistence.flush().catch(() => {}); }}>Retry save</Button>}
        {persistence.error && <Button onClick={persistence.reload}>Reload saved questions (discard local changes)</Button>}
      </div>
      <fieldset disabled={!canPrepare && phase !== "Review meeting"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {phase === "Prepare" && (!roleCanPrepare || (persistence.ready && !persistence.canEdit)) && (
        <MessageBar intent="info"><MessageBarBody>
          {preparationDomain} preparation is read-only for your role.
        </MessageBarBody></MessageBar>
      )}
      {phase === "Prepare" && (
        <div className="session-grid preparation-layout">
          {/* LEFT: AI-generated questions and meeting preparation */}
          <section className="content-panel">
            <div className="panel-heading">
              <h2>Prepare the interview</h2>
            </div>

            <div className="workspace-panel-body">
              <MeetingPreparation
                project={project}
                questions={preparedQuestions}
                onQuestionsChange={setPreparedQuestions}
                scope={preparationScope}
                canEditOverride={canPrepare}
                lockedQuestionIds={askedPreparedQuestionIds}
              />

              <p className="workspace-secondary">
                Select the questions you want to ask. They will appear
                in Conduct meeting with a Use question button.
              </p>

              <Button
                appearance="primary"
                disabled={!canPrepare}
                onClick={() => { if (canPrepare) void changePhase("Conduct meeting"); }}
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
                {preparationScope === "EA" ? "Foundry agent" : "AI connection pending"}
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

                <ProjectIntakeDetails project={project} />
              </details>

              <PreparationChat
                project={project}
                messages={preparationMessages}
                draft={preparationChatDraft}
                questions={preparedQuestions}
                onMessagesChange={setPreparationMessages}
                onDraftChange={setPreparationChatDraft}
                onAddQuestion={addQuestionFromChat}
                disabled={!canPrepare}
                scope={preparationScope}
                connected={preparationScope === "EA"}
                allowedFocuses={canPrepare ? [preparationScope] : []}
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
              <div className="session-current-question">
                <span>CURRENT QUESTION</span>
                <p>
                  {currentQuestion ||
                    "Click ‘Use question’ beside a question to begin."}
                </p>
              </div>
              <section className="meeting-question-list">
                <h3>Prepared questions</h3>


                <p className="muted-text">
                  Choose a question to ask. Marked questions are saved in discussion history; the transcript will be used in Review meeting to capture what was actually discussed.
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
                    disabled={!canPrepare}
                    maxLength={4000}
                    rows={2}
                    placeholder="Enter a question to ask during this meeting…"
                    onChange={(_, data) => setManualQuestionDraft(data.value)}
                  />
                </label>

                <Button
                  appearance="secondary"
                  disabled={!canPrepare || !manualQuestionDraft.trim()}
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



              <details className="session-history">
                <summary>
                  Discussion history ({entries.length} questions)
                </summary>

                {entries.length === 0 ? (
                  <p className="workspace-secondary">
                    No questions asked yet.
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
                      </small>
                    </article>
                  ))
                )}
              </details>
            </div>
          </section>

          <section className="content-panel">
            <div className="panel-heading">
              <h2>Meeting Assistant</h2>

              <Badge appearance="tint" color={preparationDomain === "EA" ? "informative" : "warning"}>
                {preparationDomain === "EA" ? "Foundry agent" : "AI connection pending"}
              </Badge>
            </div>

            <div className="workspace-panel-body">

              <PreparationChat
                project={project}
                scope={preparationDomain}
                disabled={!canPrepare}
                messages={meetingChatMessages}
                draft={meetingChatDraft}
                questions={[...preparedQuestions, ...additionalQuestions]}
                onMessagesChange={setMeetingChatMessages}
                onDraftChange={setMeetingChatDraft}
                onAddQuestion={addMeetingQuestionFromChat}
                connected={preparationDomain === "EA"}
                chatMode="meeting"
                beforeSend={persistence.flush}
                allowedFocuses={[preparationDomain]}
                welcomeTitle="Your review assistant"
                inputLabel="Ask the meeting assistant"
                emptyMessage="Ask for help with a stakeholder answer or request a follow-up question."
                footerText="Demo replies use the message you send. Automatic analysis of captured answers and conversation history awaits Foundry integration. Added questions appear under Additional questions."
              />


            </div>
          </section>
        </div>
      )}

      {/* Keep mounted so attachments survive phase changes. */}
      <div hidden={phase !== "Review meeting"}>
        {preparationDomain === "EA" ? <EAMeetingReview demandId={project.demandId} canEdit={canPrepare}
          beforeGenerate={persistence.flush} onAcceptedReviewChange={onAcceptedReviewChange}/> : <fieldset disabled={!canPrepare} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
        <TranscriptUpload
          attachments={transcripts}
          onAttachmentChange={setTranscripts}
          disabled={!canPrepare}
        />

        <MeetingReview
          projectName={project.name}
          entries={entries}
          corrections={reviewerCorrections}
          transcripts={transcripts}
          onAcceptedReviewChange={onAcceptedReviewChange}
          assessmentName={assessmentTab?.label ?? "assessment"}
        />
        </fieldset>}
      </div>

      {/* Keep the host assessment mounted while switching phases. */}
      {assessmentTab && (
        <div hidden={phase !== "Assessment"}>
          {assessmentTab.render(() => setPhase("Review meeting"))}
        </div>
      )}
      </fieldset>
    </section>
  );
}
