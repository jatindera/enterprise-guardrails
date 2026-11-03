import {request} from "./projects";
import type {EAReviewVersion} from "./eaReviews";
import type {Rating, ReviewStatus} from "../types";

export type HumanDecision = "Approved" | "Conditional approval" | "On hold" | "Rejected";
export interface HumanFields {
  reviewText:string; technologyStack:string; technologyRationale:string;
  complexity:Exclude<Rating,"Not assessed"> | null; decision:HumanDecision | null;
  decisionRationale:string; conditions:string;
}
export interface HumanReview extends HumanFields {
  id:string; version:number; revision:number; status:"Draft"|"Submitted"|"Superseded";
  sourceReviewId:string; parentReviewId:string|null;
  createdAt:string; updatedAt:string; createdBy:string; updatedBy:string;
  submittedAt:string|null; submittedBy:string|null;
}
export interface HumanState {
  projectRevision:number; eaStatus:string; eaComplexity:Rating;
  canEdit:boolean; canSubmit:boolean; canReopen:boolean;
  currentReview:HumanReview|null; sourceChanged:boolean; sourceReview:EAReviewVersion|null;
  history:HumanReview[];
  events:{id:string;reviewId:string;revision:number;action:string;reason:string|null;createdAt:string;createdBy:string}[];
}
export interface HumanVersion {
  review:HumanReview;
  snapshots:{id:string;action:string;reason:string|null;recordedAt:string;recordedBy:string;review:HumanReview}[];
}
export function portfolioEAStatus(status:string):ReviewStatus {
  if(status==="Conditional approval") return "Conditional";
  return ["Approved","On hold","Rejected","Pending"].includes(status) ? status as ReviewStatus : "Pending";
}
const base=(d:string)=>`/api/projects/${encodeURIComponent(d)}/ea-assessment`;
export const getHumanReview=(d:string,signal?:AbortSignal)=>request<HumanState>(base(d),{signal});
export const getHumanVersion=(d:string,id:string,signal?:AbortSignal)=>request<HumanVersion>(`${base(d)}/reviews/${id}`,{signal});
export const createHumanReview=(d:string,id:string,body:{sourceReviewId:string;expectedProjectRevision:number;
  expectedCurrentReviewId?:string;expectedCurrentRevision?:number;replaceDraft?:boolean})=>
  request<HumanReview>(`${base(d)}/reviews/${id}`,{method:"PUT",body:JSON.stringify(body)});
export const saveHumanReview=(d:string,id:string,requestId:string,body:HumanFields & {expectedRevision:number})=>
  request<HumanReview>(`${base(d)}/reviews/${id}/save/${requestId}`,{method:"PUT",body:JSON.stringify(body)});
export const submitHumanReview=(d:string,id:string,requestId:string,revision:number,projectRevision:number)=>
  request<HumanReview>(`${base(d)}/reviews/${id}/submit/${requestId}`,{method:"POST",
    body:JSON.stringify({expectedRevision:revision,expectedProjectRevision:projectRevision,confirmed:true})});
export const reopenHumanReview=(d:string,id:string,requestId:string,revision:number,projectRevision:number,reason:string)=>
  request<HumanReview>(`${base(d)}/reviews/${id}/reopen/${requestId}`,{method:"POST",
    body:JSON.stringify({expectedRevision:revision,expectedProjectRevision:projectRevision,reason})});
