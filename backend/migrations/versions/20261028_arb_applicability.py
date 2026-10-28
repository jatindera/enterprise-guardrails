"""Persist ARB applicability and initialize it from the latest intake snapshot."""
from alembic import op
import sqlalchemy as sa

revision = "20261028_arb_applicability"
down_revision = "20261028_arb_voting_rounds"
branch_labels = None
depends_on = None

"""Only an explicit Yes enables ARB; missing/blank/None means not applicable."""
import re
from fastapi import HTTPException
def clean(value):
    value = re.sub(r"\\([*#:_-])", r"\1", value)
    value = value.replace("**", "").strip()
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value).strip()


def arb_required_from_intake(markdown: str) -> bool:
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
        if name not in {"architecture review board (arb) required", "architecture review board required", "arb required"}:
            continue
        value = clean(value).casefold()
        if value in {"yes", "true"}:
            values.append(True)
        elif value in {"", "no", "false", "none", "null", "n/a", "not provided", "not specified", "not selected", "not applicable", "-"}:
            values.append(False)
        else:
            raise HTTPException(422, "ARB required must be Yes, No, or blank/None.")
    if len(set(values)) > 1:
        raise HTTPException(422, "The intake contains conflicting ARB required values.")
    return values[0] if values else False


def upgrade():
    op.add_column("projects", sa.Column("arb_required", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    bind = op.get_bind()
    # Latest snapshot wins, including an explicit blank or absent field.
    rows = bind.execute(sa.text("""
        SELECT project_id, markdown FROM (
            SELECT project_id, markdown, ROW_NUMBER() OVER (
                PARTITION BY project_id ORDER BY imported_at DESC, id DESC
            ) AS rn FROM project_intake_snapshots
        ) latest WHERE rn = 1
    """)).mappings()
    updates = []
    for row in rows:
        try:
            required = arb_required_from_intake(row["markdown"])
        except HTTPException as exc:
            raise RuntimeError("Correct invalid/conflicting ARB intake values before migrating.") from exc
        if required:
            updates.append({"project_id": row["project_id"]})
    if updates:
        bind.execute(sa.text("UPDATE projects SET arb_required = 1 WHERE id = :project_id"), updates)


def downgrade():
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("arb_required", mssql_drop_default=True)
