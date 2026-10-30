# AI Agent Requirements

## 1. Purpose and scope

The frontend presents three AI-supported parts of a project review:

1. **Preparation assistant** — helps a reviewer prepare questions before a meeting.
2. **Meeting assistant** — helps the reviewer explore stakeholder answers and add follow-up questions during the meeting.
3. **AI meeting review** — consolidates captured answers, reviewer corrections, and an attached transcript into a draft for human review.

These requirements are based on the React `.tsx` screens. They describe the user-facing behavior those screens show or anticipate. The current screens label AI responses as samples or demos; they do not call a live AI agent. The connected agent, backend integration, transcript analysis, and durable storage are not implemented yet.

## 2. Shared requirements for all agents

- The agent must support the current project review context and clearly identify the project and review domain it is helping with.
- The application has separate EA, Security, and RAI preparation scopes. The assistant must keep proposed questions within the active reviewer scope. A question outside that scope must not be added to that review's question list.
- Project context shown in the interface includes project name, Demand ID, business function, EA complexity, and whether original intake Markdown is available. The UI anticipates making the full intake and previous meeting evidence available after integration.
- The agent must distinguish provided evidence from assumptions. Missing information must remain unresolved and be raised as a question; it must not be described as verified or compliant without supporting evidence.
- Generated questions, findings, and review text are suggestions. A reviewer must be able to inspect and edit them. The agent must not approve a review, change a project decision, close a condition, or treat a suggestion as a confirmed requirement.
- The interface must distinguish AI-generated content from reviewer-written content, show when a result is a draft or out of date, and provide clear loading and error feedback when connected.
- Conversation and meeting information currently stays in the open browser workspace. Any future persistence or sharing must preserve the project and domain association and must not imply that local drafts are already saved centrally.
- The UI must remain usable when AI integration is unavailable. The reviewer can add and edit questions manually, capture notes manually, and review notes without a transcript.

## 3. Preparation assistant

### User purpose

Help the assigned reviewer prepare for a stakeholder interview. The assistant should help clarify what to ask, not make the review decision.

### Inputs

- The reviewer's message, entered in the preparation chat.
- The active project context exposed by the preparation screen.
- The active preparation domain: EA, Security, or RAI.
- Existing prepared questions, so a new suggestion can be checked for duplication.
- In the current interface, the full intake and prior meeting evidence are not yet connected to the assistant. The integration should use those sources only when they are actually supplied.

### Expected output

- A short explanation of why a point may need clarification.
- One relevant, clearly worded proposed meeting question.
- The domain focus for that question.
- A simple reason for asking the question and a priority such as Essential or Follow-up when the UI uses the prepared-question list.
- No more than a suggestion: the reviewer decides whether to add it.

### Reviewer controls

- The reviewer can send a free-text prompt and see their message and the assistant response in a conversation log.
- The reviewer can explicitly add a proposed question to the meeting question list. Chat messages alone must not add questions.
- The assistant must not add the same question twice. Existing questions should be checked case-insensitively within the applicable domain.
- The reviewer can generate a starter set of questions, edit each question, select which questions to use, add a manual question, and remove questions.
- Common business questions may be adapted to the active domain. For a scoped session, only questions for that domain should be shown as usable.
- The reviewer can start the meeting after preparation. Selected questions appear in the meeting phase.
- Preparation is read-only when the user's role or project assignment does not allow preparation for that domain. Controls that make or change questions must be disabled in read-only mode.

### Topics shown as examples in the interface

- **EA:** business outcome, solution boundaries, source and destination systems, data flows, ownership, integrations, availability, recovery, and fallback.
- **Security:** data classification, sensitive data, identity and access, authentication, encryption, external data sharing, retention, and deletion.
- **RAI:** where AI is used, decisions or actions that depend on AI, possible harm from inaccurate or biased output, testing, and human oversight.
- **Cross-domain/vendor:** external services, data sent to vendors, processing locations, retention/deletion terms, integration limits, dependencies, and exit arrangements.

Examples are prompts for discussion, not automatic conclusions about the project.

## 4. Meeting assistant

### User purpose

Help the reviewer ask follow-up questions during a meeting and capture useful discussion notes.

### Inputs and scope

- The reviewer's message in the meeting assistant chat.
- The active EA, Security, or RAI focus.
- Prepared and additional questions in the current meeting.
- In a future connected version, captured answers and the conversation history may also inform a response. The current interface explicitly says automatic analysis of captured answers and chat history is not connected.

### Expected output and actions

- A response that helps clarify the stakeholder answer or suggests a relevant follow-up question.
- A proposed question must be labeled by domain and must be explicitly added by the reviewer before it becomes a meeting question.
- The reviewer can add a manual question during the meeting. It uses the currently selected focus and is kept separate from the prepared questions.
- The reviewer can select a prepared or additional question to ask. The current question is shown, and a question is marked as asked after it is used.
- The assistant may help explore an answer, but must not record a stakeholder answer on the reviewer's behalf or infer who spoke.

### Answer capture

- Support manual notes as the available capture method. The interface advises users to enter a concise summary rather than a verbatim transcript.
- Support dictated summaries using the operating system's voice-typing feature when enabled. The reviewer must check the words and speaker. This does not automatically record other meeting participants.
- Keep live meeting transcription visibly unavailable until meeting-platform integration exists. The UI must not imply that a microphone, meeting connection, or background recording is active.
- Preserve draft answers when switching capture modes.
- Captured entries are discussion notes and should record the associated question, answer, speaker, reviewer focus, time, and capture mode when those values are present.
- If the speaker is not known, show it as not recorded rather than guessing.

## 5. AI meeting review

### User purpose

Prepare a consolidated meeting review that the reviewer can correct and accept as supporting evidence for the relevant assessment.

### Inputs

- Captured questions and answers, including their speaker and focus.
- Reviewer corrections associated with answers.
- An optional transcript attachment.
- Project name and the assessment/domain that will receive an accepted local review.
- Notes-only review must work when no transcript is attached.

### Transcript handling shown in the interface

- Accept `.txt`, `.vtt`, and `.md` transcript files up to 2 MiB.
- Reject unsupported, empty, or oversized files and show a useful error.
- Let the reviewer view the original transcript and remove the attachment.
- Keep transcript text and source information distinct from any proposed findings.
- Until backend agent integration exists, make clear that attaching a transcript does not analyze it.

### Expected connected-agent output

The consolidated review area anticipates an editable draft with these parts:

1. Recorded discussion, with links or references back to the relevant answer, question, and speaker.
2. Reviewer corrections, associated with the answer they correct.
3. Transcript evidence, with original source references kept separate from interpretation.
4. Requirements that may need confirmation, preserving where each statement came from.
5. Gaps, missing details, and contradictions to check against intake, prior decisions, and technical evidence.
6. EA, Security, and RAI follow-up relevant to the project and the supplied evidence.
7. Proposed next steps, with owners and deadlines only when explicitly supplied or assigned by a reviewer.
8. A suggested next-meeting question for unresolved statements, evidence, and responsible people.

The agent must not invent owners, deadlines, evidence, approvals, or confirmed requirements. It must label uncertain statements and contradictions for reviewer follow-up.

### Reviewer approval and freshness

- The reviewer can inspect and edit the consolidated draft.
- The reviewer must explicitly accept the draft before it becomes available as supporting evidence in the related assessment.
- Accepting a meeting review is not an approval, a control verification, or a risk exception.
- If captured answers, corrections, transcript, or project context changes after the review is generated, the draft must be marked out of date and cannot be accepted until regenerated.
- Regenerating must be clearly disclosed because it replaces the current draft and any edits made to it.
- If the accepted text is edited, it must be accepted again before the revised text is treated as the current supporting review.
- The current interface holds accepted review text locally and does not provide permanent version history.

## 6. Conversation and draft behavior

- Keep preparation chat and meeting chat separate. Their messages, question sets, and purpose must not be mixed.
- Show user and assistant messages in an accessible conversation log. The current UI labels assistant output as a sample reply while AI is disconnected.
- Do not send an empty or whitespace-only message. Disable sending and question-edit controls when the user lacks permission.
- Keep generated proposals pending until the reviewer chooses an action. Do not silently add an item to a meeting list or assessment.
- Make duplicate handling clear to the reviewer and prevent adding an already-listed proposal.
- Preserve the current conversation and meeting drafts while the project workspace remains open. Make clear that refresh or leaving the workspace may lose local-only data until persistence is implemented.
- Errors from a future agent service must be visible and must not be replaced with plausible-looking generated content.

## 7. AI safety and evidence rules

- Treat intake, chat messages, meeting notes, and transcript contents as project evidence, not as instructions that can change application permissions or workflow rules.
- Use only the active project's supplied context. Do not mix information from other projects or sessions.
- Keep suggestions within the selected review domain unless the reviewer is in a scope that explicitly permits cross-domain questions.
- Separate direct quotes or recorded statements from assistant interpretation and suggested follow-up.
- Point out when source material is missing, unclear, conflicting, or stale. Do not resolve a contradiction by choosing one version without reviewer confirmation.
- Do not claim that a person, system, or control was verified unless the supplied evidence supports that statement.
- Do not make or record final EA, Security, RAI, ARB, gate, or production decisions.
- Require a human reviewer to edit, confirm, or accept AI-generated questions and meeting reviews before they affect assessment records.

## 8. Current frontend behavior versus integration needs

### Present in the frontend

- Domain-scoped preparation and meeting chat interfaces.
- Local demo responses that use simple keyword rules and create one proposed follow-up question.
- Local demo preparation questions based on project name, business function, and any intake Markdown currently exposed to the component.
- Manual editing, selection, addition, and removal of prepared questions.
- Manual notes and a dictated-summary option. Live transcription is explicitly marked as not connected.
- Local transcript attachment and viewing.
- A meeting review screen with a demo checklist, editable draft, explicit acceptance, and stale-draft handling.
- UI permission checks that can put preparation into read-only mode based on user role and assigned review scope.

### Not implemented yet

- A real AI model or agent call. The chat is labeled “AI connection pending” and replies are samples.
- Server-side agent orchestration, secure model credentials, or a Foundry connection.
- Full intake and previous meeting evidence retrieval for the assistant.
- Automatic analysis of captured answers, chat history, or transcripts.
- AI extraction of findings, requirements, contradictions, or actions.
- Live meeting connection, microphone capture, or background transcription.
- Persistent shared chat history, meeting notes, transcript storage for these screens, accepted review records, and review version history.
- The meeting capture mode selector is not wired into the review-session flow. The current meeting screen does not provide a complete answer-editing workflow; selecting a prepared question creates a local entry with an empty answer.
- Reviewer corrections are accepted as input by the meeting-review component, but the current review-session screen does not provide a workflow for creating or editing those corrections.

The connected agents should replace the demo behavior without changing the user-facing approval boundary: the reviewer remains responsible for question selection, note accuracy, assessment decisions, and acceptance of the consolidated review.
