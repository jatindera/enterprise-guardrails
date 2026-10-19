import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";

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
}

function buildDemoReply(
  prompt: string,
  project: Project,
  questions: PreparedQuestion[],
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

  const alreadyListed = questions.some(
    (question) =>
      question.question.trim().toLowerCase() ===
      proposedText.toLowerCase(),
  );

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text:
      `Demo response: ${explanation}` +
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
  inputLabel = "Ask the preparation assistant",
  emptyMessage =
  "Ask for clarification before adding a question. For example: “The vendor says they use SSO. What else should I ask?”",
  footerText =
  "Chat is held locally while the workspace remains open. Only questions you explicitly add enter the meeting question list.",
}: PreparationChatProps) {
  function sendMessage() {
    const prompt = draft.trim();

    if (!prompt) {
      return;
    }

    const userMessage: PreparationChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt,
    };

    const reply = buildDemoReply(prompt, project, questions);

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
    <section className="preparation-chat">
      <MessageBar intent="info">
        <MessageBarBody>
          Simulated replies — Foundry integration pending.
          This demo uses keywords, not conversational reasoning
          or verification of project facts.
        </MessageBarBody>
      </MessageBar>

      <div
        className="preparation-chat-messages"
        role="log"
        aria-label="Preparation conversation"
        aria-live="polite"
        tabIndex={0}
      >
        {messages.length === 0 && (
          <p className="workspace-secondary">
            {emptyMessage}
          </p>
        )}

        {messages.map((message) => {
          const proposedQuestion = message.proposedQuestion;
          const alreadyAdded = proposedQuestion
            ? questionExists(proposedQuestion)
            : false;

          return (
            <article
              key={message.id}
              className={`preparation-chat-message preparation-chat-message--${message.role}`}
            >
              <strong>
                {message.role === "user" ? "You" : "AI assistant · Demo"}
              </strong>

              <p className="preparation-chat-text">
                {message.text}
              </p>

              {proposedQuestion && (
                <div className="preparation-chat-proposal">
                  <Badge appearance="tint">
                    {proposedQuestion.focus}
                  </Badge>

                  <p>{proposedQuestion.question}</p>

                  <Button
                    appearance="primary"
                    disabled={alreadyAdded}
                    onClick={() => onAddQuestion(proposedQuestion)}
                  >
                    {alreadyAdded
                      ? "Already in question list"
                      : "Add to meeting questions"}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <label className="session-field">
        {inputLabel}
        <Textarea
          value={draft}
          rows={3}
          placeholder="Ask what to clarify or request a tailored question…"
          onChange={(_, data) => onDraftChange(data.value)}
        />
      </label>

      <Button
        appearance="primary"
        disabled={!draft.trim()}
        onClick={sendMessage}
      >
        Send
      </Button>

      <p className="workspace-secondary">
        {footerText}
      </p>
    </section>
  );
}