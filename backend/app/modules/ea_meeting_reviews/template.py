"""Deterministic template; headings and evidence excerpts never come from the model."""

HEADINGS = (
    '1. Project understanding',
    '2. Requirements and constraints',
    '3. Independent technology review',
    '4. Gaps and contradictions',
    '5. Follow-up questions',
    '6. Review readiness',
    '7. Evidence references',
)


def render_standard(result, labels):
    chunks = ['Consolidated meeting review', 'Review template: 2.0',
        HEADINGS[0], result.summary, HEADINGS[1]]
    evidence = {}

    def finding_text(finding):
        refs = []
        for cite in finding.citations:
            key = (cite.kind, str(cite.id), cite.line)
            if key not in evidence:
                evidence[key] = (f'E{len(evidence) + 1}', cite)
            refs.append(evidence[key][0])
        chunks.append(f'{finding.kind.replace("_", " ").title()}: {finding.text} [{", ".join(dict.fromkeys(refs))}]')
        if finding.question: chunks.append('Question: ' + finding.question)
        if finding.answer: chunks.append('Stakeholder-reported answer: ' + finding.answer)

    requirements = [f for f in result.findings if f.kind in ('requirement', 'question_answer')]
    for f in requirements: finding_text(f)
    if not requirements:
        chunks.append('No requirements extracted. Confirm requirements with stakeholders; absence is not completeness.')
    chunks.extend([HEADINGS[2], 'Suitability: ' + result.technology_review.feedback,
        'Alternatives:'])
    chunks.append('\n'.join('- ' + x for x in result.technology_review.alternatives) or
        'No specific alternative proposed in this review.')
    chunks.append('Trade-offs:')
    chunks.append('\n'.join('- ' + x for x in result.technology_review.trade_offs) or
        'No specific trade-off identified; this does not establish that none exist.')
    chunks.append(HEADINGS[3])
    gaps = [f for f in result.findings if f.kind not in ('requirement', 'question_answer')]
    for f in gaps: finding_text(f)
    if not gaps:
        chunks.append('No material gaps or contradictions identified in the supplied evidence; this is not independent verification.')
    chunks.extend([HEADINGS[4], '\n'.join('- ' + q for q in result.follow_up_questions) or
        'No follow-up questions proposed for this review.', HEADINGS[5],
        'Readiness: ' + result.readiness.status, 'Reason: ' + result.readiness.reason,
        'Advisory only. Readiness is not project approval or verification of implemented controls. The human EA retains the final decision.',
        HEADINGS[6]])
    for (kind, source_id, _), (label, cite) in evidence.items():
        note = ' (excerpt truncated; open transcript for full line)' if cite.excerpt_truncated else ''
        chunks.append(f'Source: {label} | {labels[(kind, source_id)]} | transcript {source_id} | line {cite.line}{note}: "{cite.quote}"')
    chunks.append('Source excerpts are copied by the application. Confirm each cited line supports the finding; a valid reference does not validate its interpretation.')
    text = '\n\n'.join(chunks)
    if len(text) > 16000: raise ValueError('Review output too large.')
    return text
