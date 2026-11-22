import { useEffect, useRef, useState } from "react";
import { generateEAQuestions, type PolicyCitation } from "./api/projects";
import { useAuth } from "./auth/AuthGate";
import { preparationAccess, canEditPreparationFocus } from "./auth/preparationAccess";
import type { PreparationScope } from "./auth/preparationAccess";
import "./EAMeetingReview.css";

import {
  Badge,
  Button,
  Spinner,
  Textarea,
} from "@fluentui/react-components";

import PolicySources from "./PolicySources";
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
  policySources?: PolicyCitation[];
}

interface MeetingPreparationProps {
  project: Project;
  questions: PreparedQuestion[];
  onQuestionsChange: (questions: PreparedQuestion[]) => void;
  scope: Exclude<PreparationScope, "All">;
  canEditOverride?: boolean;
  lockedQuestionIds?: string[];
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
  const [noPolicyMatches, setNoPolicyMatches] = useState(false);
  const active = useRef<AbortController | null>(null);
  const latestQuestions = useRef(questions);
  latestQuestions.current = questions;
  useEffect(() => { setBusy(false); setError(""); setNoPolicyMatches(false); return () => active.current?.abort(); }, [project.demandId, scope]);
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
          ? { ...question, question: text, policySources: undefined }
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
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(""); setNoPolicyMatches(false);
    try {
      const reply = await generateEAQuestions(project.demandId, controller.signal, scope);
      if (controller.signal.aborted) return;
      // Replace only unselected AI drafts in this domain after a successful response.
      // Manual questions, selected questions and other domains survive unchanged.
      const current = latestQuestions.current.filter(q =>
        q.focus !== scope || isManualQuestion(q) || q.selected === true || lockedQuestionIds.includes(q.id));
      const existing = new Set(current.filter(q => q.focus === scope).map(q => q.question.trim().toLowerCase()));
      const added: PreparedQuestion[] = [];
      for (const q of reply.questions) {
        const key = q.question.trim().toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        added.push({ ...q, id: crypto.randomUUID(), focus: scope, selected: false, source: "ai" });
      }
      setNoPolicyMatches(reply.policyMatches === false);
      onQuestionsChange([...current, ...added]);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not prepare questions.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }

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
          AI drafts · Review before use
        </Badge>
      </div>

      <div className="meeting-review-actions">
        <Button
          appearance="primary"
          disabled={!canPrepare}
          onClick={prepareQuestions}
        >
          {busy ? "Preparing questions…" : hasAIQuestions ? "Regenerate AI questions" : "Prepare questions with AI"}
        </Button>

        <Button disabled={!canPrepare} onClick={addQuestion}>
          Add my question
        </Button>

        <Badge appearance="tint" color="brand" aria-label={`Preparation domain: ${filter}`}>
          {filter}
        </Badge>
      </div>

      {busy && (
        <div className="ea-review-feedback ea-review-feedback--progress" role="status">
          <Spinner size="tiny" aria-hidden="true" />
          <strong>{hasAIQuestions ? "Regenerating AI questions…" : "Preparing AI questions…"}</strong>
        </div>
      )}

      {hasAIQuestions && (
        <p className="workspace-secondary">Regenerating replaces unselected AI questions. Your questions and selected questions are kept.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {noPolicyMatches && <p role="status">No reference matches found. These questions use general RAI guidance.</p>}
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
                {manual ? "Your question" : "AI suggestion"}
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

            <PolicySources sources={question.policySources} />

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