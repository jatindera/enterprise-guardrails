"""Explicit, billable local smoke test using one demand's structured SQL intake."""
import argparse
import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.context import EAProjectContext
from app.agents.enterprise_architecture.service import ask
from app.db.models import Project
from app.db.session import get_engine
from app.modules.intake.service import get_context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demand-id', required=True)
    parser.add_argument('--question', default='Summarize the business and technical understanding, then ask the five most important clarification questions for EA meeting preparation.')
    args = parser.parse_args()
    settings = FoundrySettings()
    engine = get_engine()
    try:
        with Session(engine) as session:
            project = session.scalar(select(Project).where(Project.demand_id == args.demand_id))
            if project is None:
                parser.error('Demand ID was not found in the application database.')
            context = EAProjectContext(demand_id=project.demand_id, project_name=project.name,
                business_function=project.business_function, intake=get_context(session, args.demand_id))
        # Release SQL resources before model inference; no approval/database writes.
        reply = asyncio.run(ask(context, args.question, settings))
        print(reply)
    finally:
        engine.dispose()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not print prompts, intake, credentials, or service response bodies.
        print(f'EA agent test failed ({type(exc).__name__}). Check configuration, Azure login/RBAC, model deployment, and service availability.', file=sys.stderr)
        raise SystemExit(1) from None
