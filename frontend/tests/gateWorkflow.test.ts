import { expect, it } from "vitest";
import { deploymentBlocker } from "../src/projectWorkflow";
import type { Project } from "../src/types";
const ready = { eaStatus: "Approved", securityStatus: "Approved", raiStatus: "Approved", arbStatus: "Not applicable" } as Project;
it("skips the gate prerequisite only for an explicit exemption", () => {
  expect(deploymentBlocker({ ...ready, gateRequired: false })).toBeNull();
  expect(deploymentBlocker({ ...ready, gateRequired: true })).toContain("Record a production gate decision");
  expect(deploymentBlocker(ready)).toContain("Record a production gate decision");
});
it("an exemption does not bypass EA, Security, RAI or ARB prerequisites", () => {
  expect(deploymentBlocker({ ...ready, gateRequired: false, eaStatus: "Pending" })).toBe("EA approval is required.");
  expect(deploymentBlocker({ ...ready, gateRequired: false, securityStatus: "On hold" })).toBe("Security approval is required.");
  expect(deploymentBlocker({ ...ready, gateRequired: false, arbStatus: "In progress" })).toContain("Complete the required ARB");
});
