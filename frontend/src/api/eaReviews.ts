import {request} from "./projects";
export interface EAReviewVersion {
  id: string; version: number; status: "Generating" | "Failed" | "Draft" | "Accepted";
  text: string | null; basisReviewId: string | null; parentReviewId: string | null;
  createdAt: string; createdBy: string; acceptedAt: string | null; acceptedBy: string | null; canRecover: boolean;
}
export interface EASavedTranscript {id: string; fileName: string; sizeBytes: number; status: "Ready" | "Pending" | "Deleting" | "Removed" | "Cancelled"; uploadedAt: string}
export interface EAMeetingSummary {id: string; number: number; title: string; state: "Open" | "Accepted"; revision: number; createdAt: string}
export interface EAProposal {technologies: import("../types").EATechnology[]; rationale:string; updatedAt?:string|null; updatedBy?:string|null}
export interface EAMeeting extends EAMeetingSummary {
  proposal?: EAProposal;
  canEdit: boolean; canAccept: boolean; canReopen?: boolean; isCurrent?: boolean;
  reopenHistory?: {id:string;reason:string;createdAt:string;createdBy:string;acceptedReviewId:string;draftReviewId:string}[];
  transcripts: EASavedTranscript[]; reviews: EAReviewVersion[];
}
export interface EAMeetingIndex {meetings: EAMeetingSummary[]; canEdit: boolean; latestAcceptedReview: EAReviewVersion | null}
const base = (demand: string) => `/api/projects/${encodeURIComponent(demand)}/ea-review/meetings`;
export const getEAMeetings = (d: string, signal?: AbortSignal) => request<EAMeetingIndex>(base(d), {signal});
export const getEAMeeting = (d: string, id: string, signal?: AbortSignal) => request<EAMeeting>(`${base(d)}/${id}`, {signal});
export const createEAMeeting = (d: string) => request<EAMeeting>(base(d), {method: "POST", body: JSON.stringify({})});
export const uploadEATranscript = (d: string, m: string, id: string, name: string, file: Blob) =>
  request<EASavedTranscript>(`${base(d)}/${m}/transcripts/${id}?fileName=${encodeURIComponent(name)}`, {
    method: "PUT", headers: {"Content-Type": "application/octet-stream"}, body: file}, "json", 120000);
export const removeEATranscript = (d: string, m: string, id: string) => request(`${base(d)}/${m}/transcripts/${id}`, {method: "DELETE"});
export const downloadEATranscript = (d: string, m: string, id: string) => request<Blob>(`${base(d)}/${m}/transcripts/${id}/download`, {}, "blob");
export const generateEAReview = (d: string, m: string, id: string, revision: number) => request<EAReviewVersion>(
  `${base(d)}/${m}/reviews/${id}/generate`, {method: "PUT", body: JSON.stringify({expectedRevision: revision})}, "json", 240000);
export const editEAReview = (d: string, m: string, id: string, parent: string, text: string, revision: number) => request<EAReviewVersion>(
  `${base(d)}/${m}/reviews/${id}/edit`, {method: "PUT", body: JSON.stringify({expectedRevision: revision, parentReviewId: parent, text})});
export const acceptEAReview = (d: string, m: string, id: string, revision: number) => request<EAReviewVersion>(
  `${base(d)}/${m}/reviews/${id}/accept`, {method: "POST", body: JSON.stringify({expectedRevision: revision})});
export const recoverEAReview = (d: string, m: string, id: string) => request(`${base(d)}/${m}/reviews/${id}/recover`, {method: "POST"});

export const reopenEAReview = (d:string,m:string,id:string,revision:number,reason:string) => request<EAMeeting>(
  `${base(d)}/${m}/reopen/${id}`, {method:"PUT",body:JSON.stringify({expectedRevision:revision,reason})});

export const saveEAProposal = (d:string,m:string,revision:number,proposal:EAProposal) => request<EAMeeting>(
  `${base(d)}/${m}/proposal`, {method:"PUT",body:JSON.stringify({
    expectedRevision:revision,technologies:proposal.technologies,rationale:proposal.rationale})});
