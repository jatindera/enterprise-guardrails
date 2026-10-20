import type { Project } from "./types";

export function reviewSignature(project: Project): string {
  return JSON.stringify([
    project.eaStatus, project.eaComplexity,
    project.securityStatus, project.securityRisk,
    project.raiStatus, project.raiRisk, project.arbStatus,
  ]);
}

export function gateIsCurrent(project: Project): boolean {
  return Boolean(project.gateRecordedAt) &&
    project.gateReviewSignature === reviewSignature(project);
}

export function deploymentBlocker(project: Project): string | null {
  if (project.eaStatus !== "Approved") return "EA approval is required.";
  const accepted = ["Approved", "Conditional", "Not applicable"];
  if (!accepted.includes(project.securityStatus)) return "Security approval is required.";
  if (!accepted.includes(project.raiStatus)) return "Applicable RAI approval is required.";
  if (!["Not applicable", "Completed"].includes(project.arbStatus)) return "Complete the required ARB review.";
  if (!gateIsCurrent(project)) return "Record a production gate decision against the latest review classifications and decisions.";
  if (!["Approved", "Conditional approval", "Not applicable"].includes(project.gateDecision ?? "")) {
    return "The production gate decision does not permit deployment.";
  }
  return null;
}

export function deriveStage(project: Project): Project["stage"] {
  if (project.productionStatus === "In production" ||
      (project.productionStatus === undefined && project.stage === "Production")) return "Production";
  if (project.eaStatus !== "Approved") return "Architecture review";
  const accepted = ["Approved", "Conditional", "Not applicable"];
  if (!accepted.includes(project.securityStatus) || !accepted.includes(project.raiStatus)) return "Security & RAI";
  return "Stage gate";
}

export function overdueConditionCount(project: Project, today: string): number {
  return [...(project.securityConditions ?? []), ...(project.raiConditions ?? [])]
    .filter((condition) => condition.status === "Open" && condition.dueDate < today).length;
}
