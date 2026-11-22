import { Badge } from "@fluentui/react-components";

import type { PolicyCitation } from "./api/projects";

export default function PolicySources({ sources }: { sources?: PolicyCitation[] }) {
  if (!sources?.length) return null;

  return (
    <details className="workspace-secondary">
      <summary><Badge appearance="tint" color="brand">AI Search</Badge> Sources</summary>
      <ul>
        {sources.map(({ title, policyId, version, location, url }, index) => {
          const label = [title, policyId, version ? `v${version}` : null, location].filter(Boolean).join(" · ");
          return <li key={index}>{url && /^https:\/\//i.test(url)
            ? <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
            : label}</li>;
        })}
      </ul>
    </details>
  );
}
