import { createContext, useCallback, useContext } from "react";
import type { Project } from "./types";

export type ProjectPatch = Partial<Omit<Project, "demandId">>;
export const ProjectUpdateContext = createContext<
  ((demandId: string, patch: ProjectPatch) => void) | null
>(null);

export function useProjectUpdate(demandId: string) {
  const update = useContext(ProjectUpdateContext);
  if (!update) throw new Error("ProjectUpdateContext provider is missing.");
  return useCallback((patch: ProjectPatch) => update(demandId, patch), [update, demandId]);
}
