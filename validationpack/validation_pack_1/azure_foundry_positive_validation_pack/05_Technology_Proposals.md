# Technology proposals for EA Review meeting — Demand 6382

SYNTHETIC TEST INPUTS ONLY. Enter each proposal in the UI; do not attach this file as a meeting transcript. These are a human EA's proposals, not automatic agent selections or governance approvals.

## Proposal A — discovery-stage candidate (after Meeting 1)

**Checkboxes:** Azure; Foundry; Networking / Connectivity

**Rationale to paste:**

```text
I am considering Azure-hosted web/API services with a Microsoft Foundry model for the explicitly requested evidence-grounded natural-language help feature. This is a candidate, not a final stack selection. Source authorization, approved document boundaries, retention, access model, latency, cost and the need for retrieval grounding are not yet fully defined. The ordinary website and support form must remain usable without AI. Please challenge unsupported assumptions and identify clarifications.
```

**Expected:** Agent should recognize Foundry has a defensible possible use, but require clarification of data, access, retrieval, operating requirements, and costs. Technology status typically Needs clarification.

## Proposal B — defined pilot candidate (after Meeting 2)

**Checkboxes:** Azure; Foundry; Networking / Connectivity

**Rationale to paste:**

```text
Evaluate a simple React/FastAPI web application hosted in Azure App Service with Entra ID authentication; Azure SQL for support requests and app metadata; Azure Blob Storage for the curated approved-article collection; Azure AI Search for permission-filtered retrieval; and a Foundry model for grounded answers with citations and abstention. Use Azure Monitor/Application Insights for redacted telemetry and an approved email integration for manual-form notifications. AI does not take actions or process unrestricted enterprise documents. Items requiring validation include per-user search authorization, model-input handling, 90-day support-record retention, 30-day redacted logs, RTO/RPO, 60-question evaluation, and the $350/month pilot target. This is still a proposal, not evidence of implementation.
```

**Expected:** Fewer requirements gaps than Proposal A; still flag cost estimates, private connectivity/authorization design, verification evidence and pending controls.

## Proposal C — mature positive pilot architecture (after Meeting 3)

**Checkboxes:** Azure; Foundry; Networking / Connectivity

**Rationale to paste:**

```text
The stakeholders have closed the business requirements in three meetings. Proposed pilot design: React + FastAPI on Azure App Service; Microsoft Entra ID employee authentication and backend-enforced roles; Azure SQL for requests and application metadata; Azure Blob Storage for only 70 approved articles; Azure AI Search with per-user authorization-aware filtering and version control; a small Foundry model for cited grounded Q&A with abstention; approved internal email notification; and redacted Azure Monitor/Application Insights events. Search and manual request submission function when AI is unavailable. No autonomous AI actions, guest access, unrestricted company document ingestion or SAP/HR integration. Agreed targets: 60 users, 10 concurrent pilot, business-hours support, RTO 8 h, RPO 24 h, page p95 under 3 s excluding AI, AI answer under 12 s, $350/month pilot cost target subject to region/SKU verification, and 60-question human evaluation. Implementation evidence is still required for data filtering, IAM, privacy, backup/restore, cost and quality. Recommend EA assessment as a viable conditional pilot candidate with these controls and acceptance gates. Do not mark security, RAI or production approved.
```

**Expected:** A positive, well-grounded result such as Reviewed / conditionally viable with explicit delivery validations is reasonable. Do not demand additional stakeholder meetings for already-answered business questions; pending engineering tests and approvals remain conditions, not unresolved business requirements.

### Test sequence

1. Attach Meeting 1 + enter Proposal A + Save proposal + Generate review.
2. Add Meeting 2 + replace with Proposal B + Save + Regenerate review.
3. Add Meeting 3 + replace with Proposal C + Save + Regenerate review.
4. Compare successive versions. Do not automatically accept drafts. If you accept the final draft, do so as the authorized EA reviewer after checking evidence and outstanding conditions.
