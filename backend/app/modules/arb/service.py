"""Persist current votes and append history in the same transaction."""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.db.models import ARBVote, ARBVoteEvent, Project, utc_now
from app.modules.arb.schemas import RecordedVote, SubmitVote, VoterSummary, VotingResult


def voter_identity(user: dict) -> UUID | None:
    try:
        return UUID(str(user.get("objectId")))
    except (ValueError, TypeError, AttributeError):
        return None


def can_vote(user: dict) -> bool:
    roles = user.get("roles")
    return (isinstance(roles, (list, tuple)) and "arb-core-team" in roles
            and voter_identity(user) is not None)


def require_voter(user: dict) -> UUID:
    roles = user.get("roles")
    if not isinstance(roles, (list, tuple)) or "arb-core-team" not in roles:
        # Administrator access alone never grants voting rights.
        raise HTTPException(403, "Only ARB core team members may vote.")
    oid = voter_identity(user)
    if oid is None:
        raise HTTPException(401, "A valid signed-in Entra identity is required.")
    return oid


def find_project(session: Session, demand_id: str) -> Project:
    project = session.scalar(select(Project).where(Project.demand_id == demand_id))
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def voter_name(user: dict) -> str | None:
    """Snapshot the display name from verified claims, never from the vote form."""
    for key in ("name", "username"):
        value = user.get(key)
        if isinstance(value, str) and value.strip() and value.strip() != "Signed-in user":
            # SQL Server NVARCHAR limits UTF-16 code units, not Python characters.
            return value.strip().encode("utf-16-le")[:640].decode("utf-16-le", errors="ignore")
    return None


def get_results(session: Session, demand_id: str, user: dict) -> VotingResult:
    project = find_project(session, demand_id)
    # One query gives a consistent set for both names and totals.
    votes = list(session.scalars(select(ARBVote).where(ARBVote.project_id == project.id)))
    votes.sort(key=lambda vote: (not bool(vote.voter_name), (vote.voter_name or "").casefold(),
                                 str(vote.voter_object_id)))
    oid = voter_identity(user)
    own = next((vote for vote in votes if vote.voter_object_id == oid), None)
    favour = sum(vote.choice == "For" for vote in votes)
    against = sum(vote.choice == "Against" for vote in votes)
    return VotingResult(in_favour=favour, against=against, total=len(votes),
        can_vote=can_vote(user), my_vote=RecordedVote(choice=own.choice,
            reason=own.reason, revision=own.revision, recorded_at=own.recorded_at) if own else None,
        votes=[VoterSummary(voter_object_id=vote.voter_object_id, voter_name=vote.voter_name,
                           choice=vote.choice, reason=vote.reason, revision=vote.revision,
                           recorded_at=vote.recorded_at) for vote in votes])


def submit_vote(session: Session, demand_id: str, data: SubmitVote, user: dict) -> VotingResult:
    oid = require_voter(user)
    display_name = voter_name(user)
    try:
        with session.begin():
            project = find_project(session, demand_id)
            vote = session.scalar(select(ARBVote).where(
                ARBVote.project_id == project.id, ARBVote.voter_object_id == oid))
            current_revision = vote.revision if vote else 0
            if data.expected_revision != current_revision:
                raise HTTPException(409, "Your vote changed. Refresh the results before voting again.")
            effective_name = display_name or (vote.voter_name if vote is not None else None)
            if vote is None:
                vote = ARBVote(project_id=project.id, voter_object_id=oid,
                    choice=data.choice, reason=data.reason, voter_name=effective_name, recorded_at=utc_now())
                session.add(vote)
            elif vote.choice != data.choice or vote.reason != data.reason or vote.voter_name != effective_name:
                vote.choice = data.choice
                vote.reason = data.reason
                vote.voter_name = effective_name
                vote.recorded_at = utc_now()
            else:
                # Identical clicks do not add another vote or history event.
                return get_results(session, demand_id, user)
            session.flush()
            session.add(ARBVoteEvent(vote_id=vote.id, revision=vote.revision,
                choice=vote.choice, reason=vote.reason, voter_name=vote.voter_name, recorded_at=vote.recorded_at))
            session.flush()
        # Return only after commit; failures never show a successful vote.
        return get_results(session, demand_id, user)
    except StaleDataError:
        raise HTTPException(409, "Your vote changed. Refresh the results before voting again.") from None
    except IntegrityError as exc:
        if any(code in str(exc.orig) for code in ("2601", "2627", "UNIQUE constraint failed")):
            raise HTTPException(409, "Your vote changed. Refresh the results before voting again.") from None
        raise
