import type { Project } from "./types";

function reviewAllowsProduction(
  status: Project["securityStatus"],
): boolean {
  return (
    status === "Approved" ||
    status === "Conditional" ||
    status === "Not applicable"
  );
}

export function reviewSignature(project: Project): string {
  return JSON.stringify([
    project.eaStatus,
    project.eaComplexity,
    project.securityStatus,
    project.securityRisk,
    project.raiStatus,
    project.raiStatus === "Not applicable"
      ? "Not applicable"
      : project.raiRisk,
  ]);
}

export function gateIsCurrent(project: Project): boolean {
  return (
    Boolean(project.gateRecordedAt) &&
    project.gateReviewSignature === reviewSignature(project)
  );
}

export function deploymentBlocker(
  project: Project,
): string | null {
  if (project.eaStatus !== "Approved") {
    return "EA approval is required.";
  }

  if (!reviewAllowsProduction(project.securityStatus)) {
    return "Security approval is required.";
  }

  if (!reviewAllowsProduction(project.raiStatus)) {
    return "Applicable RAI approval is required.";
  }

  if (
    project.arbStatus !== "Not applicable" &&
    project.arbStatus !== "Completed"
  ) {
    return "Complete the required ARB review or mark it Not applicable.";
  }

  if (!gateIsCurrent(project)) {
    return (
      "Record a production gate decision against the latest " +
      "review classifications and decisions."
    );
  }

  const gateAllowsProduction =
    project.gateDecision === "Approved" ||
    project.gateDecision === "Conditional approval" ||
    project.gateDecision === "Not applicable";

  if (!gateAllowsProduction) {
    return "The production gate decision does not permit deployment.";
  }

  return null;
}

export function deriveStage(
  project: Project,
): Project["stage"] {
  const alreadyInProduction =
    project.productionStatus === "In production" ||
    (project.productionStatus === undefined &&
      project.stage === "Production");

  if (alreadyInProduction) {
    return "Production";
  }

  if (project.eaStatus !== "Approved") {
    return "Architecture review";
  }

  if (
    !reviewAllowsProduction(project.securityStatus) ||
    !reviewAllowsProduction(project.raiStatus)
  ) {
    return "Security & RAI";
  }

  return "Stage gate";
}

export function overdueConditionCount(
  project: Project,
  today: string,
): number {
  const conditions = [
    ...(project.securityConditions ?? []),
    ...(project.raiConditions ?? []),
  ];

  return conditions.filter(
    (condition) =>
      condition.status === "Open" &&
      Boolean(condition.dueDate) &&
      condition.dueDate < today,
  ).length;
}