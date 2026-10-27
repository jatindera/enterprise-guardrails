import type { QuestionFocus } from "../MeetingPreparation";

export type PreparationScope = "All" | Exclude<QuestionFocus, "Joint">;
export interface PreparationAccess {
  isAdmin: boolean;
  canPrepare: boolean;
  options: PreparationScope[];
  domains: QuestionFocus[];
}
export function preparationAccess(roles: readonly string[]): PreparationAccess {
  if (roles.includes("Admin")) return {
    isAdmin: true, canPrepare: true,
    options: ["All", "EA", "Security", "RAI"], domains: ["Joint", "EA", "Security", "RAI"],
  };
  const domains: Exclude<QuestionFocus, "Joint">[] = [];
  if (roles.includes("enterprise-architect")) domains.push("EA");
  if (roles.includes("security-engineer")) domains.push("Security");
  if (roles.includes("rai-manager")) domains.push("RAI");
  return { isAdmin: false, canPrepare: domains.length > 0, options: domains.length ? domains : ["All"], domains };
}
export function resolvePreparationScope(scope: PreparationScope, access: PreparationAccess): PreparationScope {
  return access.options.includes(scope) ? scope : access.options[0];
}
export function canEditPreparationFocus(access: PreparationAccess, focus: QuestionFocus): boolean {
  return access.canPrepare && access.domains.includes(focus);
}
