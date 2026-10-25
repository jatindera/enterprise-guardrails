export interface ParsedIntake {
  demandId: string;
  name: string;
  businessFunction?: string;
  assignedEA?: string;
  assignedSecurity?: string;
  markdown: string;
  fileName: string;
}
function clean(value: string): string {
  return value.replace(/\\([*#:_-])/g, "$1").replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}
function field(lines: string[], name: string): string | undefined {
  for (const raw of lines) {
    const line = clean(raw);
    if (line.startsWith("|")) {
      const cells = line.replace(/^\||\|$/g, "").split("|");
      if (cells.length >= 2 && clean(cells[0]).replace(/:$/, "").trim().toLowerCase() === name.toLowerCase()) return clean(cells[1]);
    } else {
      const normalized = line.replace(/^[-*]\s+/, "");
      const separator = normalized.indexOf(":");
      if (separator >= 0 && normalized.slice(0, separator).trim().toLowerCase() === name.toLowerCase()) return clean(normalized.slice(separator + 1));
    }
  }
  return undefined;
}
function reviewer(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value || /^(not (assigned|selected|specified|provided)|n\/a|none)(\s|$|\()/i.test(value)) return "Not assigned";
  return value;
}
export function parseIntake(markdown: string, fileName: string): ParsedIntake {
  const lines = markdown.split(/\r?\n/).map(clean).filter(Boolean);
  const headingLines = lines.map((line) => line.replace(/^#{1,6}\s*/, ""));
  const demandIndex = headingLines.findIndex((line) => /^Demand\s*Id\s*[-:]/i.test(line));
  const match = headingLines[demandIndex]?.match(/^Demand\s*Id\s*[-:]\s*(\d+)\s*$/i);
  if (!match) throw new Error("A numeric Demand ID was not found. Expected: Demand Id - 3601");
  const heading = demandIndex > 0 ? headingLines[demandIndex - 1].replace(/^Project\s+Name\s*[-:]\s*/i, "") : undefined;
  const name = field(lines, "Title") || heading;
  if (!name) throw new Error("Project name was not found. Include a project heading or Title field.");
  return {
    demandId: match[1], name,
    businessFunction: field(lines, "Demand Stakeholder LOB or Function") || undefined,
    assignedEA: reviewer(field(lines, "Architect Assigned")),
    assignedSecurity: reviewer(field(lines, "Security Resource Assigned")),
    markdown, fileName,
  };
}
