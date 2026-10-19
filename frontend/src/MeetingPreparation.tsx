import { useState } from "react";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Select,
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
}

interface MeetingPreparationProps {
  project: Project;
  questions: PreparedQuestion[];
  onQuestionsChange: (questions: PreparedQuestion[]) => void;
}

function buildDemoQuestions(project: Project): PreparedQuestion[] {
  const context = [
    project.name,
    project.businessFunction,
    project.intakeSource?.markdown ?? "",
  ]
    .join(" ")
    .toLowerCase();

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

export default function MeetingPreparation({
  project,
  questions,
  onQuestionsChange,
}: MeetingPreparationProps) {
  const [filter, setFilter] = useState<"All" | QuestionFocus>("All");

  const visibleQuestions = questions.filter(
    (question) => filter === "All" || question.focus === filter,
  );

  const selectedCount = questions.filter(
    (question) =>
      question.selected === true && question.question.trim().length > 0
  ).length;

  function updateQuestion(id: string, text: string) {
    onQuestionsChange(
      questions.map((question) =>
        question.id === id
          ? { ...question, question: text }
          : question,
      ),
    );
  }

  function toggleSelection(id: string) {
    onQuestionsChange(
      questions.map((question) =>
        question.id === id
          ? { ...question, selected: !question.selected }
          : question
      )
    );
  }

  function addQuestion() {
    onQuestionsChange([
      ...questions,
      {
        id: crypto.randomUUID(),
        focus: filter === "All" ? "Joint" : filter,
        priority: "Follow-up",
        question: "",
        reason: "Added by reviewer.",
        selected: true,
      },
    ]);
  }

  function removeQuestion(id: string) {
    onQuestionsChange(
      questions.filter((question) => question.id !== id),
    );
  }

  function prepareQuestions() {
    const generatedQuestions = buildDemoQuestions(project);

    const existingTexts = new Set(
      questions.map((question) =>
        question.question.trim().toLowerCase()
      )
    );

    const newQuestions = generatedQuestions.filter(
      (question) =>
        !existingTexts.has(question.question.trim().toLowerCase())
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
          Demo suggestions
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          This version uses intake keywords and standard questions.
          Foundry is not connected yet. The connected agent will
          interpret the full use case and previous meeting evidence.
        </MessageBarBody>
      </MessageBar>

      <div className="meeting-review-actions">
        <Button
          appearance="primary"
          onClick={prepareQuestions}
        >
          Prepare questions with AI
        </Button>

        <Button onClick={addQuestion}>
          Add my question
        </Button>

        <Select
          aria-label="Filter preparation questions by reviewer domain"
          value={filter}
          onChange={(_, data) =>
            setFilter(data.value as "All" | QuestionFocus)
          }
        >
          <option value="All">All</option>
          <option value="Joint">Joint</option>
          <option value="EA">EA</option>
          <option value="Security">Security</option>
          <option value="RAI">RAI</option>
        </Select>
      </div>

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
          No questions match this filter. Choose another domain
          or add a question.
        </p>
      )}

      {visibleQuestions.map((question) => {
        const selected = question.selected === true;

        return (
          <article
            key={question.id}
            className="prepared-question"
          >
            <div className="workspace-tags">
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
                disabled={!question.question.trim()}
                onClick={() => toggleSelection(question.id)}
              >
                {selected ? "Selected ✓" : "Select for meeting"}
              </Button>

              <Button
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