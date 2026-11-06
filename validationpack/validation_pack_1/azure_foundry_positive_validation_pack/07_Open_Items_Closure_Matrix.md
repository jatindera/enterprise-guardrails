# Open items and closure matrix — Demand 6382

SYNTHETIC TEST RECORD. An item is **Closed (requirements)** when stakeholders have agreed the required behavior. Technical execution evidence and independent approvals can remain pending without reopening the business question.

| ID | Requirement / issue | Raised | Resolved in | Final agreed requirement | Status after Meeting 3 |
|---|---|---|---|---|---|
| E1 | Business scope and audience | Intake / M1 | M2, confirmed M3 | Internal 60 users, browser only, support form + search + cited Q&A | Closed (requirements) |
| E2 | AI boundaries | M1 | M2, confirmed M3 | Grounded answers only; no autonomous actions, tickets or system changes | Closed (requirements) |
| E3 | Approved content & permissions | M1 | M2, confirmed M3 | 70 approved articles; group-filtered retrieval; editors/publishers approve changes | Closed (requirements) |
| E4 | Data classification | M1 | M2, confirmed M3 | Articles Office Only; support requests Confidential | Closed (requirements) |
| E5 | Retention and prompt logging | M1 | M2, confirmed M3 | Requests 90 days with hold exception; redacted diagnostics 30 days; no raw prompt/output telemetry | Closed (requirements) |
| E6 | Identity and role model | M1 | M2, confirmed M3 | Entra internal access; User/Editor/Publisher/Admin; backend authorization | Closed (requirements) |
| E7 | Integration | M1 | M2, confirmed M3 | SQL request form + approved email notification; no ticket API, SAP or HR | Closed (requirements) |
| E8 | Performance and continuity | M1 | M2, confirmed M3 | 10 concurrent; business hours; RTO 8 h; RPO 24 h; fallback to search + form | Closed (requirements) |
| E9 | Answer quality and RAI | M1 | M2, confirmed M3 | 60-question evaluation, >=90% accuracy on answerable set, 100% citations on answered set, abstention and no tool actions | Closed (requirements) |
| E10 | Operating cost | M1 | M2, confirmed M3 | $350/month target with detailed quote and budget controls before pilot | Closed (requirements) |
| E11 | Proposed technology | M1 | M3 | React/FastAPI App Service, Entra, SQL, Blob, AI Search, Foundry model, monitoring | Closed (candidate selection, subject to EA review) |
| E12 | Owners | M1 | M2, confirmed M3 | IT Support content; Operations triage; Business Apps maintenance; independent Security/RAI review | Closed (requirements) |

## Delivery checks still pending (NOT open stakeholder questions)

- Region/SKU estimate and actual Foundry/Search/App Service consumption before pilot.
- Proof of group-aware retrieval and API authorization, including denied-access tests.
- Privacy/content-filter and prompt-injection evaluation against sensitive inputs.
- Backup/restore, RTO/RPO, failover and degraded-mode tests.
- Evaluation of the 60 curated questions and evidence-based RAI review.
- Separate Security and RAI decisions, and any required EA/production gates.

No item in the E1–E12 stakeholder requirement set remains open at the end of Meeting 3. This is a **positive requirements-closure test**, not an unconditional production-approval test.
