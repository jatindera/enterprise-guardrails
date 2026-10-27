import { describe, expect, it } from "vitest";
import { preparationAccess, resolvePreparationScope, canEditPreparationFocus } from "./preparationAccess";

describe("preparation roles", () => {
  it("gives Admin all four dropdown choices", () => {
    expect(preparationAccess(["Admin"]).options).toEqual(["All", "EA", "Security", "RAI"]);
    expect(canEditPreparationFocus(preparationAccess(["Admin"]), "Joint")).toBe(true);
  });
  it.each([["enterprise-architect", "EA"], ["security-engineer", "Security"], ["rai-manager", "RAI"]] as const)("locks %s to %s", (role, domain) => {
    const access = preparationAccess([role]);
    expect(access.options).toEqual([domain]);
    expect(resolvePreparationScope("All", access)).toBe(domain);
    expect(canEditPreparationFocus(access, domain)).toBe(true);
    expect(canEditPreparationFocus(access, "Joint")).toBe(false);
  });
  it("limits multiple reviewer roles to their assigned domains", () => {
    const access = preparationAccess(["general-users", "enterprise-architect", "security-engineer"]);
    expect(access.options).toEqual(["EA", "Security"]);
    expect(resolvePreparationScope("RAI", access)).toBe("EA");
    expect(canEditPreparationFocus(access, "RAI")).toBe(false);
  });
  it.each([{ roles: ["general-users"] }, { roles: [] }, { roles: ["admin"] }, { roles: ["unknown"] }])("fails closed for roles $roles", ({ roles }) => {
    expect(preparationAccess(roles).canPrepare).toBe(false);
    expect(canEditPreparationFocus(preparationAccess(roles), "EA")).toBe(false);
  });
});
