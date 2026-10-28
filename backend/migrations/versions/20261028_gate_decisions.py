"""Gate applicability and append-only per-domain decisions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
revision = "20261028_gate_decisions"
down_revision = "20261028_arb_applicability"
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
        if name not in {"pre-production gate required"}:
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
    op.add_column("projects", sa.Column("gate_required", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    bind = op.get_bind()
    rows = bind.execute(sa.text("""SELECT project_id, markdown FROM (
        SELECT project_id, markdown, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY imported_at DESC, id DESC) AS rn
        FROM project_intake_snapshots) latest WHERE rn = 1""")).mappings()
    updates = [{"pid": row["project_id"]} for row in rows if arb_required_from_intake(row["markdown"])]
    if updates:
        bind.execute(sa.text("UPDATE projects SET gate_required = 1 WHERE id = :pid"), updates)
    op.create_table("gate_decision_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("domain", sa.Unicode(8), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("decision", sa.Unicode(30), nullable=False),
        sa.Column("comments", sa.Unicode(4000), nullable=False),
        sa.Column("primary_object_id", sa.Uuid(), nullable=True),
        sa.Column("reviewer_name", sa.Unicode(320), nullable=False),
        sa.Column("actor_object_id", sa.Uuid(), nullable=False),
        sa.Column("actor_name", sa.Unicode(320), nullable=False),
        sa.Column("recorded_at", DATETIMEOFFSET(), nullable=False),
        sa.UniqueConstraint("project_id", "domain", "revision", name="uq_gate_decisions_domain_revision"),
        sa.CheckConstraint("domain IN ('EA', 'Security', 'RAI')", name=op.f("ck_gate_decision_events_domain")),
        sa.CheckConstraint("decision IN ('Approved', 'Conditional approval', 'On hold', 'Rejected', 'Not applicable')", name=op.f("ck_gate_decision_events_decision")))
    op.create_index("ix_gate_decision_events_project_id", "gate_decision_events", ["project_id"])

def downgrade():
    op.drop_table("gate_decision_events")
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("gate_required", mssql_drop_default=True)
