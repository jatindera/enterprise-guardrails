"""Deterministic intake adapter: fields, heading paragraphs, and section provenance.

No model calls and no permission decisions. Unknown values remain in source_fields.
"""
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from app.modules.intake.fields import TEXT_FIELDS, BOOL_FIELDS, NUMBER_FIELDS, STAKEHOLDER_FIELDS


def clean(value: str) -> str:
    value = re.sub(r"\\([*#:_|\-])", r"\1", value).replace("**", "").strip()
    return value


def normalized(value: str) -> str:
    value = clean(value).rstrip(":?").strip().casefold()
    return re.sub(r"\s+", " ", value)


def missing(value: str) -> bool:
    return bool(re.fullmatch(r"(?:not (?:provided|specified|applicable|assigned|selected)(?:\s*\(.*\))?|n/a|none|null|-|)", clean(value), re.I))


@dataclass
class ParsedIntake:
    facts: dict = field(default_factory=dict)
    fields: list[dict] = field(default_factory=list)
    stakeholders: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def read_entries(markdown: str) -> list[dict]:
    entries = []
    headings = []
    paragraph = []
    paragraph_section = ""
    paragraph_label = ""
    known_narratives = {normalized(label) for labels in TEXT_FIELDS.values() for label in labels}

    def append(label, value, kind, section=None):
        entries.append({"ordinal": len(entries), "section": section if section is not None else " / ".join(t for _, t in headings),
            "field_name": label, "value": value, "kind": kind})

    def flush():
        if paragraph:
            append(paragraph_label or "Notes", "\n".join(paragraph).strip(),
                "Narrative" if normalized(paragraph_label) in known_narratives else "Note", paragraph_section)
            paragraph.clear()

    for raw in markdown.splitlines():
        line = clean(raw)
        if not line:
            if paragraph:
                paragraph.append("")
            continue
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*$", line)
        if heading:
            flush()
            level = len(heading[1])
            title = re.sub(r"^\d+\s*[-–—]\s*", "", heading[2]).strip()
            # Demand/title are retained as source metadata, not section parents.
            if level == 1:
                append("Heading", title, "Heading", "")
                headings = []
            else:
                headings = [(n, t) for n, t in headings if n < level]
                headings.append((level, title))
            paragraph_section = " / ".join(t for _, t in headings)
            paragraph_label = title
            continue
        row = raw.strip()
        if row.startswith(r"\|"):
            row = row[1:]
        row = row.strip("*")  # Also accept exports wrapped in bold.
        if row.startswith("|"):
            flush()
            cells = re.split(r"(?<!\\)\|", row)
            if len(cells) >= 3:
                label, value = clean(cells[1]), clean("|".join(cells[2:-1]) if row.endswith("|") else "|".join(cells[2:]))
                if normalized(label) == "field" and normalized(value) == "value":
                    continue
                if re.fullmatch(r"[:\-\s]+", label or " "):
                    continue
                if label:
                    append(label, value, "Field")
            continue
        field_line = re.sub(r"^[-*]\s+", "", line)
        # Only recognized field names or bold labels are parsed as colon fields;
        # narrative containing a colon or URL must stay narrative.
        if ":" in field_line:
            label, value = field_line.split(":", 1)
            known_labels = {normalized(x) for mapping in (TEXT_FIELDS, BOOL_FIELDS, NUMBER_FIELDS, STAKEHOLDER_FIELDS) for labels in mapping.values() for x in labels}
            if normalized(label) in known_labels or normalized(label) in {"comments", "section status"} or re.match(r"^[-*]?\s*\*\*", raw.strip()):
                flush()
                append(clean(label), clean(value), "Field")
                continue
        if re.fullmatch(r"[-*_]{3,}", line):
            flush()
            continue
        if not paragraph:
            paragraph_section = " / ".join(t for _, t in headings)
            paragraph_label = headings[-1][1] if headings else "Notes"
        paragraph.append(raw.strip())
    flush()
    return entries


def parse_intake(markdown: str) -> ParsedIntake:
    result = ParsedIntake(fields=read_entries(markdown))
    for mapping, kind in [(TEXT_FIELDS, "text"), (BOOL_FIELDS, "bool"), (NUMBER_FIELDS, "number")]:
        for name, labels in mapping.items():
            accepted = {normalized(label) for label in labels}
            matches = [entry["value"] for entry in result.fields
                if entry["kind"] in {"Field", "Narrative"} and normalized(entry["field_name"]) in accepted]
            if not matches:
                result.facts[name] = None
                continue
            values = list(dict.fromkeys(value for value in matches if not missing(value)))
            if len(values) > 1:
                result.warnings.append(f"{name}: multiple source values; inspect sourceFields before relying on this field.")
            value = values[0] if len(values) == 1 else None
            if value is None:
                result.facts[name] = None
            elif kind == "text":
                result.facts[name] = value
            elif kind == "bool":
                flag = clean(value).casefold()
                result.facts[name] = True if flag in {"yes", "true"} else False if flag in {"no", "false"} else None
                if result.facts[name] is None:
                    result.warnings.append(f"{name}: unrecognized boolean; original value retained in sourceFields.")
            else:
                try:
                    number = Decimal(re.sub(r"[$,%\s]", "", value))
                    if not number.is_finite() or number < 0:
                        raise InvalidOperation
                    if name == "expected_user_count":
                        if number != number.to_integral_value() or number > 9223372036854775807:
                            raise InvalidOperation
                        result.facts[name] = int(number)
                    else:
                        if number.as_tuple().exponent < -2 or number > (100 if name == "priority_score" else Decimal("99999999999999999.99")):
                            raise InvalidOperation
                        result.facts[name] = number
                except (InvalidOperation, ValueError):
                    result.facts[name] = None
                    result.warnings.append(f"{name}: unrecognized or out-of-range number; original value retained in sourceFields.")

    email_pattern = re.compile(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}", re.I)
    for role, labels in STAKEHOLDER_FIELDS.items():
        accepted = {normalized(label) for label in labels}
        for entry in result.fields:
            if entry["kind"] != "Field" or normalized(entry["field_name"]) not in accepted or missing(entry["value"]):
                continue
            value = entry["value"]
            emails = list(dict.fromkeys(email_pattern.findall(value)))
            if not emails:
                result.stakeholders.append({"role": role, "display_name": value, "email": None, "source_value": value})
                continue
            for email in emails:
                if len(email.encode("utf-16-le")) // 2 > 320:
                    result.warnings.append(f"{role}: email too long; inspect retained source field.")
                    continue
                display = None
                if len(emails) == 1:
                    visible = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
                    visible = visible.replace(email, "").replace("mailto:", "").strip(" <>[]()\"'.,;\t")
                    display = visible or None
                result.stakeholders.append({"role": role, "display_name": display, "email": email.casefold(), "source_value": value})
    return result
