"""Only an explicit Yes enables the Pre-Production Gate; missing/blank/None means not applicable."""
import re
from fastapi import HTTPException
from app.modules.projects.intake_fields import clean


def gate_required_from_intake(markdown: str) -> bool:
    values = []
    for raw in markdown.splitlines():
        line = clean(raw.replace(r"\|", "|"))
        if line.startswith("|"):
            cells = line.strip("|").split("|")
            if len(cells) < 2:
                continue
            name, value = cells[:2]
        else:
            line = re.sub(r"^[-*]\s+", "", line)
            if ":" not in line:
                continue
            name, value = line.split(":", 1)
        name = re.sub(r"\s+", " ", clean(name).rstrip(":").strip()).casefold()
        if name not in {"pre-production gate required"}:
            continue
        value = clean(value).casefold()
        if value in {"yes", "true"}:
            values.append(True)
        elif value in {"", "no", "false", "none", "null", "n/a", "not provided", "not specified", "not selected", "not applicable", "-"}:
            values.append(False)
        else:
            raise HTTPException(422, "Pre-Production Gate Required must be Yes, No, or blank/None.")
    if len(set(values)) > 1:
        raise HTTPException(422, "The intake contains conflicting Pre-Production Gate Required values.")
    return values[0] if values else False
