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

export type GateReviewDomain = "EA" | "Security" | "RAI";

export type GateReviewDecision = "Approved" | "Conditional approval" | "On hold" | "Rejected" | "Not applicable";

export interface GateDomainReview {
  decision: GateReviewDecision;
  comments: string;
  reviewer: string;
  recordedAt: string;
  reviewSignature: string;
  evidenceFileNames: string[];
}

export type EATechnology =
  | "Azure"
  | "Foundry"
  | "Copilot Studio"
  | "M365 agent"
  | "Power Apps"
  | "Databricks"
  | "SAP BTP"
  | "Salesforce"
  | "SaaS / Third-party service"
  | "External APIs"
  | "Networking / Connectivity"
  | "Microsoft 365 / SharePoint"
  | "Power Automate"
  | "Power BI"
  | "On-premises systems"
  | "Others";

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
  arbRequired?: boolean;
  arbCompletionDate?: string;
  gateDecision?: "Approved" | "Conditional approval" | "On hold" | "Rejected" | "Not applicable";
  gateRequired?: boolean;
  gateScope?: string;
  gateDomainReviews?: Partial<Record<GateReviewDomain, GateDomainReview>>;
  gateRecordedAt?: string;
  gateReviewSignature?: string;
  productionStatus?: "Not deployed" | "In production";
  goLiveDate?: string;
  leanixStatus?: "Not planned" | "Planned" | "Submitted";
  leanixId?: string;
  leanixUrl?: string;
  productionComments?: string;
  productionSavedAt?: string;
  productionSavedBy?: string;
  productionRevision?: number;
  securityConditions?: TrackedCondition[];
  raiConditions?: TrackedCondition[];
  intakeSource?: {
    fileName: string;
    markdown: string;
    importedAt: string;
  };
  eaItems?: EAAction[];
  eaTechnologyStack?: EATechnology[];
  eaTechnologyStackOther?: string;
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