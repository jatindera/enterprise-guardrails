"""Deterministic source alignment. Never invent quotes or accept unknown sources."""
import re
from itertools import islice

class CitationError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def align_citation(citation, sources):
    lines = sources.get((citation.kind, str(citation.id)))
    if not lines: raise CitationError('unknown_source')
    if not citation.quote.strip(): raise CitationError('empty_quote')
    if citation.line <= len(lines) and citation.quote in lines[citation.line - 1]:
        return False
    # A unique literal quote may have a wrong line number or different line wraps.
    # Only whitespace is flexible; changed words/numbers/punctuation still fail.
    tokens = re.split(r'\s+', citation.quote.strip())
    pattern = r'\s+'.join(re.escape(token) for token in tokens)
    source = '\n'.join(lines)
    matches = list(islice(re.finditer(pattern, source), 2))
    if not matches: raise CitationError('quote_not_found')
    if len(matches) != 1: raise CitationError('ambiguous_quote')
    match = matches[0]
    actual = source[match.start():match.end()]
    if len(actual) > 240: raise CitationError('quote_too_long')
    citation.line = source.count('\n', 0, match.start()) + 1
    citation.quote = actual
    return True


def unwrap_json(text):
    value = text.strip().lstrip('\ufeff')
    fence = re.fullmatch(r'```(?:json)?[ \t]*\r?\n(.*?)\r?\n?```', value, re.S | re.I)
    return fence.group(1).strip() if fence else value
