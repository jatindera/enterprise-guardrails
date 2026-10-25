import { describe, expect, it } from "vitest";
import { parseIntake } from "./parseIntake";

const table = `# Project Name - Agent 365 SDK POV
# Demand Id - 3845
| Field | Value |
|---|---|
| Title | Agent 365 SDK POV |
| Demand Stakeholder LOB or Function | IT |
| Architect Assigned | Not provided (placeholder: Select Architect) |
| Security Resource Assigned | Christina Kelly |`;

describe("table and bullet intake", () => {
  it("reads table fields without including the Project Name prefix", () => {
    const result = parseIntake(table, "intake.md");
    expect(result.name).toBe("Agent 365 SDK POV");
    expect(result.demandId).toBe("3845");
    expect(result.businessFunction).toBe("IT");
    expect(result.assignedEA).toBe("Not assigned");
    expect(result.assignedSecurity).toBe("Christina Kelly");
  });
  it("reads bullet fields and Markdown mail labels", () => {
    const result = parseIntake(`# Sales Plays
# Demand Id - 003601
- **Architect Assigned:** [Jatinder Arora](mailto:ja@example.com)
- **Security Resource Assigned:** Christina Kelly
- **Demand Stakeholder LOB or Function:** Tyvek`, "intake.md");
    expect(result.demandId).toBe("003601");
    expect(result.assignedEA).toBe("Jatinder Arora");
    expect(result.assignedSecurity).toBe("Christina Kelly");
    expect(result.businessFunction).toBe("Tyvek");
  });
  it("strips a project heading prefix without a Title row", () => {
    expect(parseIntake("# Project Name - Test project\n# Demand Id - 9", "i.md").name).toBe("Test project");
  });
  it("distinguishes missing from an explicit unassigned value", () => {
    expect(parseIntake("# Test\n# Demand Id - 9", "i.md").assignedSecurity).toBeUndefined();
    expect(parseIntake("# Test\n# Demand Id - 9\n| Security Resource Assigned | Not selected |", "i.md").assignedSecurity).toBe("Not assigned");
  });
  it("rejects a missing numeric Demand ID", () => {
    expect(() => parseIntake("# Test\n# Demand Id - invalid", "i.md")).toThrow("numeric Demand ID");
  });
});
