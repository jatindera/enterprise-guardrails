export type ReviewStatus =
  | "Pending"
  | "In progress"
  | "Approved"
  | "Conditional"
  | "Not applicable";

export type Rating = "Low" | "Medium" | "High" | "Not assessed";

export interface Project {
  demandId: string;
  name: string;
  businessFunction: string;
  assignedEA: string;
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
    intakeSource?: {
    fileName: string;
    markdown: string;
    importedAt: string;
  };
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