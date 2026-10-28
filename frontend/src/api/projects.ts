import { getAccessToken } from "../auth/authClient";
import type { IntakeDraft } from "../IntakeImport";
import type { Project } from "../types";

export interface ProjectRecord {
  id: string;
  demandId: string;
  name: string;
  businessFunction: string;
  assignedEa: string;
  assignedSecurity: string;
  assignedRai: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  intakeSource?: Project["intakeSource"] | null;
}

interface ProjectPage {
  items: ProjectRecord[];
  total: number;
  offset: number;
  limit: number;
}

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 45000);

  try {
    const token = await getAccessToken();
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers,
    });
    const body = await response.json();
    if (!response.ok) {
      const message = body?.error?.message ?? body?.detail;
      throw new Error(
        typeof message === "string"
          ? message
          : `API request failed (${response.status}).`,
      );
    }
    return body as T;
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new Error("The API request timed out. Refresh before retrying; your changes may already have been saved.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the API. Check that the backend is running.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

export async function listProjects(signal?: AbortSignal): Promise<ProjectRecord[]> {
  const records: ProjectRecord[] = [];
  let offset = 0;
  while (true) {
    const page = await request<ProjectPage>(
      `/api/projects?offset=${offset}&limit=100`, { signal },
    );
    records.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) break;
  }
  return records;
}

export function getProject(demandId: string): Promise<ProjectRecord> {
  return request<ProjectRecord>(`/api/projects/${encodeURIComponent(demandId)}`);
}

export interface EAAccess {
  canEdit: boolean;
  canManageAdditional: boolean;
  canClose: boolean;
  additionalEmail: string | null;
  primaryResolved: boolean;
  revision: number;
}

export function getEAAccess(demandId: string): Promise<EAAccess> {
  return request<EAAccess>(`/api/projects/${encodeURIComponent(demandId)}/ea-access`);
}

export function resolvePrimaryEA(demandId: string, expectedRevision: number): Promise<EAAccess> {
  return request<EAAccess>(`/api/projects/${encodeURIComponent(demandId)}/ea-primary-resolution`, {
    method: "POST", body: JSON.stringify({ expectedRevision }),
  });
}

export function saveAdditionalEA(demandId: string, email: string | null, expectedRevision: number): Promise<EAAccess> {
  return request<EAAccess>(`/api/projects/${encodeURIComponent(demandId)}/additional-ea`, {
    method: "PATCH", body: JSON.stringify({ email, expectedRevision }),
  });
}

export interface SecurityAccess extends EAAccess {}

export function getSecurityAccess(demandId: string): Promise<SecurityAccess> {
  return request<SecurityAccess>(`/api/projects/${encodeURIComponent(demandId)}/security-access`);
}

export function resolvePrimarySecurity(demandId: string, expectedRevision: number): Promise<SecurityAccess> {
  return request<SecurityAccess>(`/api/projects/${encodeURIComponent(demandId)}/security-primary-resolution`, {
    method: "POST", body: JSON.stringify({ expectedRevision }),
  });
}

export function saveAdditionalSecurity(demandId: string, email: string | null, expectedRevision: number): Promise<SecurityAccess> {
  return request<SecurityAccess>(`/api/projects/${encodeURIComponent(demandId)}/additional-security`, {
    method: "PATCH", body: JSON.stringify({ email, expectedRevision }),
  });
}

export interface RAIAccess extends EAAccess {}

export function getRAIAccess(demandId: string): Promise<RAIAccess> {
  return request<RAIAccess>(`/api/projects/${encodeURIComponent(demandId)}/rai-access`);
}

export function resolvePrimaryRAI(demandId: string, expectedRevision: number): Promise<RAIAccess> {
  return request<RAIAccess>(`/api/projects/${encodeURIComponent(demandId)}/rai-primary-resolution`, {
    method: "POST", body: JSON.stringify({ expectedRevision }),
  });
}

export function saveAdditionalRAI(demandId: string, email: string | null, expectedRevision: number): Promise<RAIAccess> {
  return request<RAIAccess>(`/api/projects/${encodeURIComponent(demandId)}/additional-rai`, {
    method: "PATCH", body: JSON.stringify({ email, expectedRevision }),
  });
}

export function importProject(draft: IntakeDraft): Promise<ProjectRecord> {
  return request<ProjectRecord>("/api/projects/import", {
    method: "POST",
    body: JSON.stringify({
      demandId: draft.demandId,
      name: draft.name,
      businessFunction: draft.businessFunction || null,
      assignedEa: draft.assignedEA || null,
      fileName: draft.fileName,
      markdown: draft.markdown,
      expectedRevision: draft.expectedRevision ?? null,
    }),
  });
}

export function projectFromApi(record: ProjectRecord, existing?: Project): Project {
  return {
    ...(existing ?? {
      stage: "Architecture review",
      eaStatus: "Pending",
      securityStatus: "Pending",
      raiStatus: "Pending",
      eaComplexity: "Not assessed",
      securityRisk: "Not assessed",
      raiRisk: "Not assessed",
      arbStatus: "Not scheduled",
      nextAction: "Review imported intake and confirm review applicability",
      overdueActions: 0,
    }),
    id: record.id,
    demandId: record.demandId,
    name: record.name,
    businessFunction: record.businessFunction,
    // Pydantic's camel-case alias for assigned_ea is assignedEa.
    assignedEA: record.assignedEa,
    assignedSecurity: record.assignedSecurity,
    assignedRAI: record.assignedRai,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.intakeSource !== undefined
      ? { intakeSource: record.intakeSource ?? undefined }
      : {}),
  };
}


export function updateRAIAssignment(demandId: string, assignedRAI: string, expectedRevision: number): Promise<ProjectRecord> {
  return request<ProjectRecord>(`/api/projects/${encodeURIComponent(demandId)}/rai-assignment`, {
    method: "PATCH",
    body: JSON.stringify({ assignedRai: assignedRAI.trim(), expectedRevision }),
  });
}



export type ARBVoteChoice = "For" | "Against";

export interface ARBRecordedVote {
  choice: ARBVoteChoice;
  reason: string | null;
  revision: number;
  recordedAt: string;
}

export interface ARBVoterSummary extends ARBRecordedVote {
  voterObjectId: string;
  voterName: string | null;
}

export interface ARBRoundSummary {
  number: number;
  status: "Open" | "Closed";
  outcome: "Passed" | "Returned for review" | null;
  openedAt: string | null;
  openedByName: string | null;
  reopenReason: string | null;
  closedAt: string | null;
  closedByName: string | null;
}

export interface ARBVotingResult {
  roundNumber: number;
  currentRoundNumber: number;
  status: "Open" | "Closed";
  outcome: "Passed" | "Returned for review" | null;
  closedAt: string | null;
  closedByName: string | null;
  reopenReason: string | null;
  canClose: boolean;
  canReopen: boolean;
  rounds: ARBRoundSummary[];
  inFavour: number;
  against: number;
  total: number;
  canVote: boolean;
  myVote: ARBRecordedVote | null;
  votes: ARBVoterSummary[];
}

export function getARBVoting(demandId: string, signal?: AbortSignal, roundNumber?: number): Promise<ARBVotingResult> {
  return request<ARBVotingResult>(
    `/api/projects/${encodeURIComponent(demandId)}/arb-voting${roundNumber === undefined ? "" : "?roundNumber=" + roundNumber}`, { signal },
  );
}

export function saveARBVote(
  demandId: string, choice: ARBVoteChoice, reason: string | null, expectedRevision: number, roundNumber: number,
): Promise<ARBVotingResult> {
  return request<ARBVotingResult>(`/api/projects/${encodeURIComponent(demandId)}/arb-vote`, {
    method: "PUT", body: JSON.stringify({ choice, reason, expectedRevision, roundNumber }),
  });
}



export function closeARBVoting(demandId: string, roundNumber: number): Promise<ARBVotingResult> {
  return request<ARBVotingResult>(`/api/projects/${encodeURIComponent(demandId)}/arb-voting/close`, {
    method: "POST", body: JSON.stringify({ roundNumber }),
  });
}

export function reopenARBVoting(demandId: string, roundNumber: number, reason: string): Promise<ARBVotingResult> {
  return request<ARBVotingResult>(`/api/projects/${encodeURIComponent(demandId)}/arb-voting/reopen`, {
    method: "POST", body: JSON.stringify({ roundNumber, reason }),
  });
}
