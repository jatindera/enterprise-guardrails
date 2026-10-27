"""Extract an architect UPN from a specific intake field, not narrative text."""
import re
from dataclasses import dataclass

_EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", re.I)


class AmbiguousArchitect(ValueError):
    pass


@dataclass(frozen=True)
class ArchitectField:
    present: bool
    upn: str | None


def architect_upn_from_intake(markdown: str) -> ArchitectField:
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
        if label.strip().rstrip(":").casefold() != "architect assigned":
            continue
        if result is not None:
            raise AmbiguousArchitect("The intake contains more than one assigned architect field.")
        found = {match.group(0).casefold() for match in _EMAIL.finditer(value)}
        if len(found) > 1:
            raise AmbiguousArchitect("The assigned architect field contains multiple email addresses.")
        result = ArchitectField(True, next(iter(found), None))
    return result or ArchitectField(False, None)
