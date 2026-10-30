import type { Project } from "./types";

/** Shared context for preparation/chat; no Markdown parsing or AI calls. */
export function projectIntakeContext(project: Project): string {
  const context = project.intakeContext;
  return JSON.stringify({
    demandId: project.demandId, name: project.name,
    businessFunction: project.businessFunction,
    intake: context ? {
      version: context.version, facts: context.facts,
      stakeholders: context.stakeholders, comments: context.comments,
      sourceFields: context.sourceFields, parsingWarnings: context.parsingWarnings,
    } : null,
  });
}

/** Keyword demo sees facts only: field labels such as aiEffort are not evidence of AI use. */
export function intakeSuggestionText(project: Project): string {
  const facts = project.intakeContext?.facts;
  return [project.name, project.businessFunction,
    ...Object.values(facts ?? {}).filter(value => typeof value === "string"),
    facts?.aiEffort === true ? "AI" : "",
  ].join(" ").toLowerCase();
}
