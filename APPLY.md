Copy the included backend and frontend files into your existing project folders. Keep all earlier integration and chat-animation changes. Restart FastAPI and refresh/restart the frontend. No .env changes, migration, dependency installation or hosted-agent deployment is needed.

Changes:
- EA chat now defaults to answering explanatory questions without a meeting-question proposal. Proposals are requested only when explicitly asked for or a specific missing project fact is necessary, and must stay focused on one issue relevant to the current topic. AI relevance still needs reviewer judgment.
- Once EA AI questions exist, the button reads Regenerate AI questions.
- A successful regeneration replaces only unselected EA AI questions. Manual questions, selected questions, and other domains are preserved with their existing IDs and selection states. New questions start unselected. Duplicates within the response or against preserved EA questions are skipped.
- Failed regeneration preserves the original question list.
- Security and RAI question-generation behavior is unchanged.

Test:
1. Ask the chat to explain a concept. It should normally answer without adding a proposed meeting question. Start a fresh chat for a clean test.
2. Explicitly ask for one meeting question about SDK dependency vulnerabilities. Expect a short focused question, rather than a bundled evidence request. Web search is not yet connected, so confirmed current vulnerabilities cannot be verified through search.
3. Generate EA questions, select one, and add a manual question. Click Regenerate AI questions twice. The manual and selected questions must remain, and only the unselected AI set should be refreshed rather than accumulating another full set each time.
4. Test an invalid agent version: regeneration should show an error and keep the original list. Restore the valid version and restart the backend.

Verified: 12 targeted backend tests, seven targeted frontend tests and the production frontend build passed. Model phrasing and relevance should be checked live through the UI.
