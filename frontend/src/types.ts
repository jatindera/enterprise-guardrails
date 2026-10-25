export type ReviewStatus =
  | "Pending"
  | "In progress"
  | "Approved"
  | "Conditional"
  | "Not applicable"
  | "On hold"
  | "Rejected";

export type Rating = "Low" | "Medium" | "High" | "Not assessed";

export interface TrackedCondition {
  id: string;
  description?: string;
  owner?: string;
  comments?: string;
  status: "Open" | "Closed";
  dueDate: string;
}

export interface EAAction extends TrackedCondition {
  description: string;
  comments: string;
  createdAt: string;
  closedAt?: string;
}

export interface Project {
  id?: string;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  demandId: string;
  name: string;
  businessFunction: string;
  assignedEA: string;
  assignedSecurity?: string;
  assignedRAI?: string;
  stage: "Architecture review" | "Security & RAI" | "Stage gate" | "Production";
  eaStatus: ReviewStatus;
  securityStatus: ReviewStatus;
  raiStatus: ReviewStatus;
  eaComplexity: Rating;
  securityRisk: Rating;
  raiRisk: Rating;
  nextAction: string;
  overdueActions: number;
  arbStatus:
  | "Not applicable"
  | "Not scheduled"
  | "In progress"
  | "Returned for review"
  | "Completed";
  arbCompletionDate?: string;
  gateDecision?: "Approved" | "Conditional approval" | "On hold" | "Rejected" | "Not applicable";
  gateScope?: string;
  gateRecordedAt?: string;
  gateReviewSignature?: string;
  productionStatus?: "Not deployed" | "In production";
  goLiveDate?: string;
  leanixStatus?: "Not planned" | "Planned" | "Submitted";
  leanixId?: string;
  leanixUrl?: string;
  productionComments?: string;
  productionSavedAt?: string;
  securityConditions?: TrackedCondition[];
  raiConditions?: TrackedCondition[];
  intakeSource?: {
    fileName: string;
    markdown: string;
    importedAt: string;
  };
  eaItems?: EAAction[];
}

export type PortfolioFilter =
  | "all"
  | "active"
  | "overdue"
  | "conditional"
  | "arbCompleted";

export interface AcceptedMeetingReview {
  text: string;
  acceptedAt: string;
}

export interface EARequirement {
  id: string;
  description: string;
  sourceReference: string;
  sourceReview?: AcceptedMeetingReview;
  status: "Draft" | "Confirmed";
  comments?: string;
}

export interface EAFinding {
  id: string;
  description: string;
  sourceReference: string;
  status: "Open" | "Resolved";
  resolution: string;
}