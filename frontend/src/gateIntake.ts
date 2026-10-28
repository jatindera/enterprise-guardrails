/** Frontend preview only. Backend parsing/enforcement follows in the next increment. */
export function preProductionGateRequired(markdown: string): boolean {
  const values: string[] = [];
  const clean = (text: string) => text.replace(/\\([*|:_-])/g, "$1").replace(/\*\*/g, "").trim();
  for (const raw of markdown.split(/\r?\n/)) {
    const line = clean(raw);
    let name: string;
    let value: string;
    if (line.startsWith("|")) {
      const cells = line.split("|");
      name = clean(cells[1] ?? "");
      value = clean(cells[2] ?? "");
    } else {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      name = clean(line.slice(0, colon).replace(/^[-*]\s+/, ""));
      value = clean(line.slice(colon + 1));
    }
    if (name.replace(/:$/, "").trim().toLowerCase() === "pre-production gate required") {
      values.push(value.toLowerCase());
    }
  }
  // Blank, absent, No, or conflicting values cannot enable a gate.
  return values.length > 0 && values.every((value) => value === "yes");
}
