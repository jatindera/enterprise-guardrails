"""Transition helper: backfill legacy text before its column is removed.

Safe to rerun after removal: verifies completeness and returns a no-op summary.
"""
import json
from sqlalchemy import exists, inspect, literal_column, select
from sqlalchemy.orm import Session
from app.db.models import ProjectIntakeSnapshot, ProjectIntakeDetail
from app.db.session import get_engine
from app.modules.intake.parser import parse_intake
from app.modules.intake.service import store_context


def backfill(engine):
    with Session(engine) as session:
        ids = list(session.scalars(select(ProjectIntakeSnapshot.id).where(~exists().where(
            ProjectIntakeDetail.snapshot_id == ProjectIntakeSnapshot.id))))
    has_raw = any(column['name'] == 'markdown' for column in inspect(engine).get_columns('project_intake_snapshots'))
    completed = 0
    failed = []
    for snapshot_id in ids:
        if not has_raw:
            failed.append({'snapshotId': str(snapshot_id), 'errorType': 'StructuredIntakeMissing'})
            continue
        try:
            with Session(engine) as session, session.begin():
                row = session.execute(select(ProjectIntakeSnapshot,
                    literal_column('project_intake_snapshots.markdown')).where(ProjectIntakeSnapshot.id == snapshot_id)
                    .with_hint(ProjectIntakeSnapshot, 'WITH (UPDLOCK, HOLDLOCK)', dialect_name='mssql')).first()
                added = row is not None and store_context(session, row[0], parse_intake(row[1]))
            if added:
                completed += 1
        except Exception as exc:
            failed.append({'snapshotId': str(snapshot_id), 'errorType': type(exc).__name__})
    return {'completed': completed, 'failed': failed}


def main():
    result = backfill(get_engine())
    print(json.dumps(result))
    return 1 if result['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
