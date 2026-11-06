import {Badge,Button,Checkbox,Textarea} from "@fluentui/react-components";
import type {EATechnology} from "./types";

const technologies:EATechnology[]=[
  "Azure","Foundry","Copilot Studio","M365 agent","Power Apps",
  "Databricks","SAP BTP","Salesforce","SaaS / Third-party service",
  "External APIs","Networking / Connectivity","Microsoft 365 / SharePoint",
  "Power Automate","Power BI","On-premises systems","Others",
];

import type {EAProposal} from "./api/eaReviews";

export default function EAReviewProposal({disabled=false,value,dirty,onChange,onSave,onDiscard,saveDisabled=false}:{
  disabled?:boolean;value:EAProposal;dirty:boolean;onChange:(value:EAProposal)=>void;onSave:()=>void;onDiscard:()=>void;saveDisabled?:boolean;
}) {
  const selected=value.technologies;const rationale=value.rationale;
  return <section className="content-panel ea-review-proposal" aria-label="Proposed technology stack">
    <div className="panel-heading"><h2>Proposed technology stack</h2><Badge appearance="tint" color="warning">{dirty ? "Unsaved changes" : value.updatedAt ? "Saved" : "Not recorded"}</Badge></div>
    <div className="workspace-panel-body">
      <p>Select the proposed technologies and explain the rationale before requesting AI review.
        This proposal is separate from the human EA’s final assessment.</p>
      <fieldset className="ea-review-proposal-options" disabled={disabled}>
        <legend>Proposed technologies</legend>
        {technologies.map(technology=><Checkbox key={technology} label={technology}
          checked={selected.includes(technology)} onChange={(_,data)=>{
            if (!disabled) onChange({...value,technologies:data.checked===true
              ? [...new Set([...selected,technology])]
              : selected.filter(item=>item!==technology)});
          }}/>)}
      </fieldset>
      <label className="session-field">Rationale
        <Textarea aria-label="Proposed technology stack rationale" rows={4} resize="vertical" maxLength={4000}
          value={rationale} disabled={disabled} onChange={(_,data)=>{if (!disabled) onChange({...value,rationale:data.value});}}
          placeholder="Explain why this stack is proposed, including relevant constraints or trade-offs. If Others is selected, name those technologies here."/>
      </label>
      <div className="ea-review-toolbar"><Button appearance="primary" disabled={disabled || saveDisabled || !dirty} onClick={onSave}>Save proposal</Button>
        {dirty && <Button appearance="primary" disabled={disabled} onClick={onDiscard}>Discard proposal changes</Button>}</div>
      {value.updatedAt && <p className="workspace-secondary">Saved by {value.updatedBy ?? "EA reviewer"} · {new Date(value.updatedAt).toLocaleString()}</p>}
      <p className="workspace-secondary">Review meeting with AI automatically saves pending proposal changes first.
        The saved proposal and all Ready transcripts are included in the review. AI may challenge the proposal or ask more questions.
        Your final EA assessment remains separate.</p>
    </div>
  </section>;
}
