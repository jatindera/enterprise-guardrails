/** Render the stored review as safe React text, including legacy plain-text versions.
 * Colours describe explicit finding categories, never inferred approval/sentiment.
 * No HTML, scripts or model-supplied links are executed.
 */
const standardHeadings = [
  "1. Project understanding", "2. Requirements and constraints", "3. Independent technology review",
  "4. Gaps and contradictions", "5. Follow-up questions", "6. Review readiness", "7. Evidence references",
];

export default function EAReviewReader({text}: {text: string}) {
  return <article className="ea-review-reader" aria-label="Formatted meeting review">
    <p className="ea-review-legend">Red: attention required · Green: resolved item · Black: review text. Resolved items are not independently verified controls.</p>
    {text.split(/\n\s*\n/).filter(Boolean).map((block,index) => {
      const value=block.trim();
      if (standardHeadings.includes(value) || value === "Consolidated meeting review" || value === "Next meeting questions" || value.startsWith("Independent technology proposal review — "))
        return <h3 key={index} className={value.endsWith("Needs clarification") ? "ea-review-attention" : undefined}>{value}</h3>;
      if (value === "Readiness: Needs clarification" || value === "Readiness: Ready for human assessment")
        return <p key={index} className={`ea-review-readiness ea-review-readiness--${value.endsWith("Needs clarification") ? "attention" : "ready"}`}><strong>{value}</strong></p>;
      if (value === "Alternatives:" || value === "Trade-offs:") return <h4 key={index}>{value.slice(0,-1)}</h4>;
      if (value.startsWith("Source:")) return <blockquote key={index}><em>{value}</em></blockquote>;
      if (value.startsWith("- ")) return <ul key={index}>{value.split("\n").map((line,i)=><li key={i}>{line.replace(/^- /,"")}</li>)}</ul>;
      const finding=/^(Requirement|Question Answer|Open Item|Resolved Item|Change|Contradiction|Question|Stakeholder-reported answer|Suitability|Reason):\s*([\s\S]*)$/.exec(value);
      if (finding) {
        const tone=["Open Item","Contradiction"].includes(finding[1]) ? "attention" : finding[1] === "Resolved Item" ? "resolved" : "neutral";
        return <div key={index} className={`ea-review-finding ea-review-finding--${tone}`}><strong>{finding[1]}</strong><p>{finding[2]}</p></div>;
      }
      return <p key={index}>{value}</p>;
    })}
  </article>;
}
