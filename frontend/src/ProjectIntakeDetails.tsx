import type { Project } from "./types";
import "./ProjectIntakeDetails.css";

function label(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase());
}
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
export default function ProjectIntakeDetails({ project }: { project: Project }) {
  const context = project.intakeContext;
  if (!context) return <p className="workspace-secondary">Structured intake is not available. Refresh after import or run the intake backfill for older records.</p>;
  const { facts, version } = context;
  const narratives = ["problemStatement", "valueDescription", "desiredBusinessOutcome"] as const;
  return <div className="project-intake-details">
    <p className="workspace-secondary">Imported intake facts · {version.sourceSystem} · {new Date(version.importedAt).toLocaleString()}. Assessment decisions are recorded separately.</p>
    {context.parsingWarnings.length > 0 && <div role="status" className="intake-warning"><strong>Some intake values need confirmation</strong><ul>{context.parsingWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    {narratives.map(key => <div key={key}><h3>{label(key)}</h3><p className="intake-narrative">{valueText(facts[key])}</p></div>)}
    <h3>Stakeholders from intake</h3>
    {context.stakeholders.length === 0 ? <p>No stakeholders provided.</p> : <div className="intake-table-scroll"><table className="intake-stakeholders"><thead><tr><th>Role</th><th>Name / source value</th><th>Email</th></tr></thead><tbody>{context.stakeholders.map((person, index) => <tr key={index}><td>{person.role}</td><td>{person.displayName || person.sourceValue}</td><td>{person.email || "Not provided"}</td></tr>)}</tbody></table></div>}
    <p className="workspace-secondary">Stakeholder details do not grant access or change reviewer assignments.</p>
    <details><summary>All intake details</summary><dl className="intake-detail-grid">{Object.entries(facts).filter(([key]) => !narratives.includes(key as typeof narratives[number])).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{valueText(value)}</dd></div>)}</dl></details>
    <details><summary>Comments and additional source fields</summary>{context.sourceFields.length ? context.sourceFields.map(field => <div className="intake-source-field" key={field.ordinal}><strong>{field.section} · {field.fieldName}</strong><p className="intake-narrative">{field.value}</p></div>) : <p>No additional source fields.</p>}</details>
  </div>;
}
