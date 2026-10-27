"""Extract an architect UPN from a specific intake field, not narrative text."""
import re
from dataclasses import dataclass

_EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", re.I)


class AmbiguousSecurity(ValueError):
    pass


@dataclass(frozen=True)
class SecurityField:
    present: bool
    upn: str | None


def security_upn_from_intake(markdown: str) -> SecurityField:
    result = None
    for raw_line in markdown.splitlines():
        # Strip Markdown styling without discarding mailto link targets.
        line = re.sub(r"\\([*#:_-])", r"\1", raw_line).replace("**", "").strip()
        if line.startswith("|"):
            parts = line.strip("|").split("|")
            if len(parts) < 2:
                continue
            label, value = parts[0].strip(), parts[1].strip()
        else:
            line = re.sub(r"^[-*]\s+", "", line)
            label, separator, value = line.partition(":")
            if not separator:
                continue
        if label.strip().rstrip(":").casefold() != "security resource assigned":
            continue
        if result is not None:
            raise AmbiguousSecurity("The intake contains more than one assigned security reviewer field.")
        found = {match.group(0).casefold() for match in _EMAIL.finditer(value)}
        if len(found) > 1:
            raise AmbiguousSecurity("The assigned security reviewer field contains multiple email addresses.")
        result = SecurityField(True, next(iter(found), None))
    return result or SecurityField(False, None)
