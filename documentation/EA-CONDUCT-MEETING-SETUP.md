# EA Conduct meeting: connected assistant and saved additional questions

## Apply

Copy the included backend/ and frontend/ files into your existing project and restart both applications. The ZIP includes the latest single-input web-search adapter files so the shared chat implementation stays compatible. Use your actual frontend folder containing package.json; the artifact uses the correct frontend/ prefix.

No database migration, dependency upgrade, new .env setting or hosted-agent deployment is required. Existing APP_EA_EXECUTION_MODE=local|hosted and the hosted version setting continue to apply. The new task profile is selected in FastAPI and sent at runtime; the agent factory and core instructions are unchanged.

## What changed

EA Assessment > Conduct meeting > Meeting Assistant now calls the existing EA agent through POST /api/projects/{demand_id}/ea-preparation/meeting-chat. The Conduct meeting task profile gives concise explanations and optional focused follow-up questions. It receives compact project intake, the current EA question read from this project's database record, and bounded meeting-chat history. It never assumes it can hear the meeting or read a transcript that has not been supplied.

Before sending chat, the UI waits for pending question saves. This prevents the assistant from reading an older current question while the UI has a newer one. A save error blocks inference and preserves the chat draft. Ordinary chat uses one agent response request; optional Search web uses the existing bounded public-query preparation and research flow.

The assistant is available to assigned EA, additional EA with the EA role, and Admin. Other users cannot invoke it. Security and RAI meeting assistants retain their existing pending integration behavior.

## Additional question persistence

Manual additions and AI questions explicitly accepted using Add to additional questions enter the existing additionalQuestions collection and existing debounced save queue. The tables remain:

- meeting_preparations: project/domain association, revision and current question.
- meeting_prepared_questions: question text, reason, source, position, selection and asked metadata; these rows use kind=additional.

Rapid edits are batched using the existing one-second debounce and serialized revision checks. Save status, retry and conflict handling remain in place. There is no write for every chat message and no new chat table. Wait for Saved before refreshing or closing.

AI suggestions do not enter the database merely because they appear in chat. Explicitly adding a question does not mark it asked. Use question records application-marked progress and server timestamps; it is not proof of speech. The recording/transcript will be the evidence of what was actually said when Review meeting is implemented.

Duplicate additions are prevented against the prepared/additional lists in the UI. Manual fields respect the existing 4000-character backend limit. AI reasons and sources are retained.

## Verify in your app

1. Open EA Assessment > Conduct meeting with an authorized reviewer. The assistant badge should say Foundry agent.
2. Select Use question and immediately ask the assistant for a follow-up. Pending saves should complete before chat sends.
3. Add a manual additional question and an assistant-proposed question. Wait for Meeting questions: Saved, refresh, and return to Conduct meeting; both should reappear.
4. Confirm suggestions you did not explicitly add are absent from the additional-question list after refresh.
5. Confirm adding a draft does not mark it asked. Mark one using Use question and verify it restores with discussion history after refresh.
6. Check ordinary explanations can return no proposal, service errors retain the draft, and unauthorized viewers cannot edit or chat.
7. Test both local and hosted execution using your existing settings.

Chat remains a workspace draft. Live transcription, transcript uploads/storage and transcript-based question recovery are not part of this increment.

## Validation

Backend: 384 passed, 1 skipped, 3 subtests passed. Frontend: 115 tests passed across 16 files. Production frontend build passed with the existing bundle-size warning. Tests cover permissions, database current-question scope, question/source/history round trips, manual/AI question restoration and save failure blocking chat.

Cloud calls were mocked; live Azure and UI checks still need to run in your environment.
