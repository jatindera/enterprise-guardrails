import { useEffect, useRef, useState } from "react";
import { generateEAQuestions } from "./api/projects";
import { useAuth } from "./auth/AuthGate";
import { preparationAccess, canEditPreparationFocus } from "./auth/preparationAccess";
import type { PreparationScope } from "./auth/preparationAccess";

import {
  Badge,
  Button,
  Textarea,
} from "@fluentui/react-components";

import type { Project } from "./types";

export type QuestionFocus = "Joint" | "EA" | "Security" | "RAI";

export interface PreparedQuestion {
  id: string;
  focus: QuestionFocus;
  priority: "Essential" | "Follow-up";
  question: string;
  reason: string;
  selected?: boolean;
  source?: "manual" | "ai";
}

interface MeetingPreparationProps {
  project: Project;
  questions: PreparedQuestion[];
  onQuestionsChange: (questions: PreparedQuestion[]) => void;
  scope: Exclude<PreparationScope, "All">;
  canEditOverride?: boolean;
  lockedQuestionIds?: string[];
}

import { intakeSuggestionText } from "./projectIntakeContext";

function buildDemoQuestions(project: Project): PreparedQuestion[] {
  const context = intakeSuggestionText(project);

  function question(
    focus: QuestionFocus,
    text: string,
    reason: string,
    priority: PreparedQuestion["priority"] = "Essential",
  ): PreparedQuestion {
    return {
      id: crypto.randomUUID(),
      focus,
      priority,
      question: text,
      reason,
      selected: false,
      source: "ai",
    };
  }

  const questions: PreparedQuestion[] = [
    question(
      "Joint",
      `What business outcome should ${project.name} deliver, and how will success be measured?`,
      "Reconfirm the intake purpose and measurable business value.",
    ),
    question(
      "Joint",
      "Who owns the application and its data, who will use it, and what is the target timeline?",
      "Confirm accountability, users, and delivery expectations.",
    ),
    question(
      "EA",
      "Which source, processing, and destination systems are involved, and what moves between them?",
      "Establish architecture boundaries and data flows.",
    ),
    question(
      "EA",
      "What happens if the application is unavailable or produces incorrect results, and what fallback exists?",
      "Understand business impact and operational requirements.",
    ),
    question(
      "Security",
      "What data classification has the data owner confirmed, and which sensitive or regulated fields are involved?",
      "Reconfirm classification rather than relying only on intake.",
    ),
    question(
      "Security",
      "How will users and workloads authenticate, and who controls their access?",
      "Identify SSO, authorization, managed identity, and credential needs.",
    ),
  ];

  if (/\b(ai|agent|agents|foundry|copilot|ml|mosaic)\b/.test(context)) {
    questions.push(
      question(
        "RAI",
        "What decisions or actions depend on AI, and who checks its outputs before they are used?",
        "AI-related terms appear in intake context; confirm autonomy and oversight.",
      ),
      question(
        "RAI",
        "What would happen if AI produced inaccurate, biased, or inappropriate output, and how will this be tested?",
        "Assess potential harm and use-case-specific evaluation needs.",
      ),
    );
  }

  if (/\b(saas|vendor|api|apis|zoominfo)\b/.test(context)) {
    questions.push(
      question(
        "Security",
        "What information reaches external vendors, where is it processed, and what retention and deletion terms apply?",
        "External-service terms appear in intake context; confirm the data boundary.",
      ),
      question(
        "EA",
        "Which vendor technical contacts should explain integration limits, dependencies, and service exit arrangements?",
        "Prepare the right technical follow-up with the vendor.",
        "Follow-up",
      ),
    );
  }

  if (/\b(sap|salesforce)\b/.test(context)) {
    questions.push(
      question(
        "EA",
        "Is SAP or Salesforce actually in scope, and does the proposed integration read, write, or perform business actions?",
        "The system is mentioned in intake; confirm whether it is included or explicitly excluded.",
      ),
    );
  }

  return questions;
}

function isManualQuestion(question: PreparedQuestion): boolean {
  return question.source === "manual" ||
    (question.source === undefined && question.reason === "Added by reviewer.");
}

export default function MeetingPreparation({
  project,
  questions,
  onQuestionsChange,
  scope,
  canEditOverride = true,
  lockedQuestionIds = [],
}: MeetingPreparationProps) {
  const access = preparationAccess(useAuth().roles);
  const filter = scope;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const latestQuestions = useRef(questions);
  latestQuestions.current = questions;
  useEffect(() => { setBusy(false); setError(""); return () => active.current?.abort(); }, [project.demandId, scope]);
  const canPrepare = canEditPreparationFocus(access, scope) && canEditOverride && !busy;
  const canEdit = (question: PreparedQuestion) => canPrepare && question.focus === scope && !lockedQuestionIds.includes(question.id);

  const visibleQuestions = questions
    .filter((question) => question.focus === filter)
    .sort((a, b) => Number(isManualQuestion(b)) - Number(isManualQuestion(a)));

  const hasAIQuestions = questions.some(q => q.focus === scope && !isManualQuestion(q));

  const selectedCount = questions.filter(
    (question) =>
      (question.focus === filter) && question.selected === true && question.question.trim().length > 0
  ).length;

  function updateQuestion(id: string, text: string) {
    if (!questions.some((question) => question.id === id && canEdit(question))) return;
    onQuestionsChange(
      questions.map((question) =>
        question.id === id
          ? { ...question, question: text }
          : question,
      ),
    );
  }

  function toggleSelection(id: string) {
    if (!questions.some((question) => question.id === id && canEdit(question))) return;
    onQuestionsChange(
      questions.map((question) =>
        question.id === id
          ? { ...question, selected: !question.selected }
          : question
      )
    );
  }

  function addQuestion() {
    if (!canPrepare) return;
    onQuestionsChange([
      {
        id: crypto.randomUUID(),
        focus: filter,
        priority: "Follow-up",
        question: "",
        reason: "Added by reviewer.",
        selected: false,
        source: "manual",
      },
      ...questions,
    ]);
  }

  function removeQuestion(id: string) {
    if (!questions.some((question) => question.id === id && canEdit(question))) return;
    onQuestionsChange(
      questions.filter((question) => question.id !== id),
    );
  }

  async function prepareQuestions() {
    if (!canPrepare || active.current && !active.current.signal.aborted && busy) return;
    if (scope === "EA") {
      const controller = new AbortController();
      active.current = controller;
      setBusy(true); setError("");
      try {
        const reply = await generateEAQuestions(project.demandId, controller.signal);
        if (controller.signal.aborted) return;
        // Replace only unselected EA AI drafts after a successful response.
        // Manual questions, selected questions and other domains survive unchanged.
        const current = latestQuestions.current.filter(q =>
          q.focus !== "EA" || isManualQuestion(q) || q.selected === true || lockedQuestionIds.includes(q.id));
        const existing = new Set(current.filter(q => q.focus === "EA").map(q => q.question.trim().toLowerCase()));
        const added: PreparedQuestion[] = [];
        for (const q of reply.questions) {
          const key = q.question.trim().toLowerCase();
          if (existing.has(key)) continue;
          existing.add(key);
          added.push({ ...q, id: crypto.randomUUID(), focus: "EA", selected: false, source: "ai" });
        }
        onQuestionsChange([...current, ...added]);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not prepare questions.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
      return;
    }
    const generatedQuestions = buildDemoQuestions(project)
      .filter((question) => question.focus === filter || question.focus === "Joint")
      .map((question) => question.focus === "Joint" ? { ...question, focus: filter } : question);
    // Common business questions belong to the active reviewer domain when scoped.

    const existingTexts = new Set(
      questions.map((question) =>
        `${question.focus}:${question.question.trim().toLowerCase()}`
      )
    );

    const newQuestions = generatedQuestions.filter(
      (question) =>
        !existingTexts.has(`${question.focus}:${question.question.trim().toLowerCase()}`)
    );

    onQuestionsChange([...questions, ...newQuestions]);
  }

  return (
    <section className="preparation-questions">
      <div className="session-heading">
        <div>
          <h3 className="session-subheading">
            Questions to prepare
          </h3>

          <p>
            Edit the questions and select those you want available
            in Conduct meeting.
          </p>
        </div>

        <Badge appearance="tint" color="warning">
          {scope === "EA" ? "AI drafts · Review before use" : "Demo suggestions"}
        </Badge>
      </div>

      <div className="meeting-review-actions">
        <Button
          appearance="primary"
          disabled={!canPrepare}
          onClick={prepareQuestions}
        >
          {busy ? "Preparing questions…" : scope === "EA" && hasAIQuestions ? "Regenerate AI questions" : "Prepare questions with AI"}
        </Button>

        <Button disabled={!canPrepare} onClick={addQuestion}>
          Add my question
        </Button>

        <Badge appearance="tint" color="brand" aria-label={`Preparation domain: ${filter}`}>
          {filter}
        </Badge>
      </div>

      {scope === "EA" && hasAIQuestions && (
        <p className="workspace-secondary">Regenerating replaces unselected AI questions. Your questions and selected questions are kept.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {questions.length === 0 ? (
        <p className="workspace-secondary">
          Prepare the initial question set or add your own.
        </p>
      ) : (
        <p className="workspace-secondary" role="status">
          Showing {visibleQuestions.length} of {questions.length} questions.
          {" "}
          {selectedCount} selected for Conduct meeting.
        </p>
      )}

      {questions.length > 0 && visibleQuestions.length === 0 && (
        <p className="workspace-secondary">
          No questions are available for this domain yet.
        </p>
      )}

      {visibleQuestions.map((question) => {
        const selected = question.selected === true;
        const manual = isManualQuestion(question);

        return (
          <article
            key={question.id}
            className="prepared-question"
            style={{
              backgroundColor: manual ? "#fff8e8" : "#f3f8fe",
              border: `1px solid ${manual ? "#e8cf8b" : "#d3e3f4"}`,
              borderLeft: `4px solid ${manual ? "#b77a12" : "#196db0"}`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div className="workspace-tags">
              <Badge appearance="tint" color={manual ? "warning" : "brand"}>
                {manual ? "Your question" : scope === "EA" ? "AI suggestion" : "AI suggestion · Demo"}
              </Badge>
              <Badge appearance="tint" color="brand">
                {question.focus}
              </Badge>

              <Badge
                appearance="tint"
                color={
                  question.priority === "Essential"
                    ? "warning"
                    : "informative"
                }
              >
                {question.priority}
              </Badge>
            </div>

            <label className="session-field">
              Question
              <Textarea
                value={question.question}
                rows={3}
                disabled={!canEdit(question)}
                onChange={(_, data) =>
                  updateQuestion(question.id, data.value)
                }
              />
            </label>

            <p className="workspace-secondary">
              Why ask: {question.reason}
            </p>

            <div className="meeting-review-actions">
              <Button
                appearance={selected ? "primary" : "secondary"}
                aria-pressed={selected}
                disabled={!canEdit(question) || !question.question.trim()}
                onClick={() => toggleSelection(question.id)}
              >
                {selected ? "Selected ✓" : "Select for meeting"}
              </Button>

              <Button
                disabled={!canEdit(question)}
                onClick={() => removeQuestion(question.id)}
              >
                Remove
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}