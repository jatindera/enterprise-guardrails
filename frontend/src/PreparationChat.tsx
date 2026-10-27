import {
  Badge,
  Button,
  Textarea,
} from "@fluentui/react-components";

import { useId } from "react";
import "./PreparationChat.css";

import type { PreparationScope } from "./auth/preparationAccess";
import type { Project } from "./types";
import type {
  PreparedQuestion,
  QuestionFocus,
} from "./MeetingPreparation";

export interface PreparationChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposedQuestion?: PreparedQuestion;
}

interface PreparationChatProps {
  project: Project;
  messages: PreparationChatMessage[];
  draft: string;
  questions: PreparedQuestion[];
  onMessagesChange: (messages: PreparationChatMessage[]) => void;
  onDraftChange: (draft: string) => void;
  onAddQuestion: (question: PreparedQuestion) => void;
  inputLabel?: string;
  emptyMessage?: string;
  footerText?: string;
  disabled?: boolean;
  scope?: PreparationScope;
  allowedFocuses?: QuestionFocus[];
}

function buildDemoReply(
  prompt: string,
  project: Project,
  questions: PreparedQuestion[],
  scope: PreparationScope,
): PreparationChatMessage {
  const text = prompt.toLowerCase();

  let focus: QuestionFocus = "EA";
  let explanation: string;
  let proposedText: string;

  if (/\b(sso|login|authentication|identity|access)\b/.test(text)) {
    focus = "Security";
    explanation =
      "SSO is one discussion point. You could also clarify how access is granted, reviewed, and removed, including existing sessions.";
    proposedText =
      "How are application permissions and active sessions revoked when a user leaves or changes roles?";
  } else if (/\b(retention|retain|deletion|delete|storage)\b/.test(text)) {
    focus = "Security";
    explanation =
      "Clarify the complete data lifecycle, including copies held in logs, backups, and vendor systems.";
    proposedText =
      "What retention and deletion rules apply to application data, logs, backups, and any vendor-held copies?";
  } else if (/\b(ai|agent|model|bias|rai|hallucination)\b/.test(text)) {
    focus = "RAI";
    explanation =
      "Clarify what the AI can do, the consequences of an incorrect result, and where human review is required.";
    proposedText =
      "Which AI outputs or actions require human review, and how will incorrect or harmful results be detected and handled?";
  } else if (/\b(vendor|saas|external|api)\b/.test(text)) {
    focus = "Security";
    explanation =
      "For an external service, clarify what leaves the organization and how the provider handles that information.";
    proposedText =
      "What data is sent to the external service, where is it processed, and what restrictions apply to its use and deletion?";
  } else if (/\b(failure|unavailable|outage|recovery|fallback)\b/.test(text)) {
    explanation =
      "Discuss the business impact of an outage and the process the team can use while service is restored.";
    proposedText =
      "What business process is affected during an outage, and what recovery targets and manual fallback are required?";
  } else {
    explanation =
      "A useful starting point is to clarify the solution boundary and ownership before choosing technical services.";
    proposedText =
      `For ${project.name}, which systems provide and receive data, and who owns each integration?`;
  }

  if (scope !== "All" && focus !== scope) {
    focus = scope;
    const domainReply = {
      EA: {
        explanation: "For EA preparation, clarify the solution boundaries, integrations, ownership, and business impact.",
        question: `For ${project.name}, which source and destination systems are in scope, who owns them, and what happens if an integration fails?`,
      },
      Security: {
        explanation: "For Security preparation, confirm sensitive data, identities, access controls, and protection across the data flow.",
        question: "What sensitive data is processed, who can access it, and how are identities, encryption, retention, and deletion controlled?",
      },
      RAI: {
        explanation: "For RAI preparation, clarify how AI is used, possible harm, evaluations, and human oversight.",
        question: "What actions or decisions depend on AI, what harm could incorrect outputs cause, and what testing and human oversight are planned?",
      },
    }[scope];
    explanation = domainReply.explanation;
    proposedText = domainReply.question;
  }

  const alreadyListed = questions.some(
    (question) =>
      question.question.trim().toLowerCase() ===
      proposedText.toLowerCase(),
  );

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text:
      `${explanation}` +
      (alreadyListed
        ? " This proposed question is already in your preparation list."
        : ""),
    proposedQuestion: {
      id: crypto.randomUUID(),
      focus,
      priority: "Follow-up",
      question: proposedText,
      reason: "Suggested during preparation chat; review before use.",
      selected: true,
      source: "ai",
    },
  };
}

export default function PreparationChat({
  project,
  messages,
  draft,
  questions,
  onMessagesChange,
  onDraftChange,
  onAddQuestion,
  disabled = false,
  scope = "All",
  allowedFocuses = ["Joint", "EA", "Security", "RAI"],
  inputLabel = "Ask the preparation assistant",
  emptyMessage =
  "Ask for clarification before adding a question. For example: “The vendor says they use SSO. What else should I ask?”",
  footerText =
  "Chat is held locally while the workspace remains open. Only questions you explicitly add enter the meeting question list.",
}: PreparationChatProps) {
  const inputId = useId();

  function sendMessage() {
    const prompt = draft.trim();

    if (disabled || !prompt) {
      return;
    }

    const userMessage: PreparationChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt,
    };

    const reply = buildDemoReply(prompt, project, questions, scope);

    onMessagesChange([...messages, userMessage, reply]);
    onDraftChange("");
  }

  function questionExists(question: PreparedQuestion) {
    return questions.some(
      (item) =>
        item.question.trim().toLowerCase() ===
        question.question.trim().toLowerCase(),
    );
  }

  return (
    <section className="eg-chat" aria-label="Assistant conversation">
      <div className="eg-chat-log" role="log" aria-label="Assistant conversation" aria-live="polite" tabIndex={0}>
        {messages.length === 0 && (
          <div className="eg-chat-empty">
            <span className="eg-chat-avatar" aria-hidden="true">💬</span>
            <div><strong>How can I help?</strong><p>{emptyMessage}</p></div>
          </div>
        )}
        {messages.map((message) => {
          const proposedQuestion = message.proposedQuestion;
          const alreadyAdded = proposedQuestion ? questionExists(proposedQuestion) : false;
          return (
            <article key={message.id} className={`eg-chat-row eg-chat-row--${message.role}`}>
              {message.role === "assistant" && <span className="eg-chat-avatar" aria-hidden="true">💬</span>}
              <div className={`eg-chat-bubble eg-chat-bubble--${message.role}`}>
                <strong>{message.role === "user" ? "You" : "Assistant · sample reply"}</strong>
                <p className="eg-chat-text">{message.text}</p>
                {proposedQuestion && (
                  <div className="eg-chat-proposal">
                    <Badge appearance="tint">{proposedQuestion.focus}</Badge>
                    <p>{proposedQuestion.question}</p>
                    <Button appearance="primary"
                      disabled={disabled || alreadyAdded || !allowedFocuses.includes(proposedQuestion.focus)}
                      onClick={() => {
                        if (!disabled && allowedFocuses.includes(proposedQuestion.focus)) onAddQuestion(proposedQuestion);
                      }}>
                      {alreadyAdded ? "Already in question list" : "Add to meeting questions"}
                    </Button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="eg-chat-composer">
        <label className="eg-chat-label" htmlFor={inputId}>{inputLabel}</label>
        <Textarea id={inputId} value={draft} rows={2} disabled={disabled}
          placeholder="Ask what to clarify or request a tailored question…"
          onChange={(_, data) => { if (!disabled) onDraftChange(data.value); }} />
        <div className="eg-chat-composer-actions">
          <span>Sample replies · AI connection pending</span>
          <Button appearance="primary" disabled={disabled || !draft.trim()} onClick={sendMessage}
            icon={<span aria-hidden="true">➤</span>}>Send</Button>
        </div>
      </div>
      <p className="eg-chat-footer">{footerText}</p>
    </section>
  );
}
