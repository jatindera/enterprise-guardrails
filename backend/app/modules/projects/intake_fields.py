"""Read named fields from table or bullet-style intake exports, never narrative."""
import re
from fastapi import HTTPException


def clean(value: str) -> str:
    value = re.sub(r"\\([*#:_-])", r"\1", value)
    value = value.replace("**", "").strip()
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value).strip()


def read_field(markdown: str, field_name: str) -> str | None:
    found: str | None = None
    target = field_name.casefold()
    for raw in markdown.splitlines():
        line = clean(raw)
        if line.startswith("|"):
            cells = line.strip("|").split("|")
            if len(cells) >= 2 and clean(cells[0]).rstrip(":").strip().casefold() == target:
                found = clean(cells[1])
                break
        else:
            line = re.sub(r"^[-*]\s+", "", line)
            if ":" in line:
                name, value = line.split(":", 1)
                if name.strip().casefold() == target:
                    found = clean(value)
                    break
    return found


def reviewer_from_intake(markdown: str, field_name: str) -> str | None:
    value = read_field(markdown, field_name)
    if value is None:
        return None  # absent field: preserve an existing assignment
    if not value or re.match(r"^(not (?:assigned|selected|specified|provided)|n/a|none)(?:\s|$|\()", value, re.I):
        return "Not assigned"  # explicit placeholder: clear a previous assignment
    if len(value.encode("utf-16-le")) // 2 > 320:
        raise HTTPException(422, f"{field_name} exceeds 320 characters.")
    return value
