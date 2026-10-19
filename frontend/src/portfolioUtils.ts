import type { PortfolioFilter, Project } from "./types";

export const portfolioFilterLabels: Record<PortfolioFilter, string> = {
  all: "All projects",
  active: "Active reviews",
  overdue: "Overdue actions",
  conditional: "Conditional approvals",
  arbCompleted: "Completed ARBs",
};

export function matchesPortfolioFilter(
  project: Project,
  filter: PortfolioFilter,
): boolean {
  switch (filter) {
    case "active":
      return project.stage !== "Production";

    case "overdue":
      return project.overdueActions > 0;

    case "conditional":
      return [
        project.eaStatus,
        project.securityStatus,
        project.raiStatus,
      ].includes("Conditional");

    case "arbCompleted":
      return project.arbStatus === "Completed";

    default:
      return true;
  }
}