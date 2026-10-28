"""Voting rounds. All writes serialize on the project's SQL Server row."""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.db.models import ARBVote, ARBVoteEvent, ARBVotingRound, Project, utc_now
from app.modules.arb.schemas import (
    RecordedVote, SubmitVote, VoterSummary, VotingResult, RoundSummary, RoundAction, ReopenRound,
)


def voter_identity(user: dict) -> UUID | None:
    try:
        return UUID(str(user.get("objectId")))
    except (ValueError, TypeError, AttributeError):
        return None


def has_role(user: dict, role: str) -> bool:
    roles = user.get("roles")
    return isinstance(roles, (list, tuple)) and role in roles


def can_vote(user: dict) -> bool:
    return has_role(user, "arb-core-team") and voter_identity(user) is not None


def require_voter(user: dict) -> UUID:
    return require_identity(user, "arb-core-team", "Only ARB core team members may vote.")


def require_identity(user: dict, role: str, message: str) -> UUID:
    if not has_role(user, role):
        raise HTTPException(403, message)
    oid = voter_identity(user)
    if oid is None:
        raise HTTPException(401, "A valid signed-in Entra identity is required.")
    return oid


def find_project(session: Session, demand_id: str, *, lock: bool = False) -> Project:
    query = select(Project).where(Project.demand_id == demand_id)
    if lock:
        # SQL Server ignores generic FOR UPDATE. This explicit hint holds the
        # same per-project update lock for vote, close and reopen until commit.
        query = query.with_hint(Project, "WITH (UPDLOCK, HOLDLOCK)", dialect_name="mssql")
    project = session.scalar(query)
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def voter_name(user: dict) -> str | None:
    for key in ("name", "username"):
        value = user.get(key)
        if isinstance(value, str) and value.strip() and value.strip() != "Signed-in user":
            return value.strip().encode("utf-16-le")[:640].decode("utf-16-le", errors="ignore")
    return None


def all_rounds(session: Session, project_id: UUID) -> list[ARBVotingRound]:
    return list(session.scalars(select(ARBVotingRound)
        .where(ARBVotingRound.project_id == project_id).order_by(ARBVotingRound.number)))


def active_round(session: Session, project_id: UUID) -> ARBVotingRound:
    rows = all_rounds(session, project_id)
    if rows:
        return rows[-1]
    # New projects start automatically; no "Open voting" action is needed.
    row = ARBVotingRound(project_id=project_id, number=1, status="Open")
    session.add(row)
    session.flush()
    return row


def round_votes(session: Session, project_id: UUID, number: int) -> list[ARBVote]:
    return list(session.scalars(select(ARBVote).where(
        ARBVote.project_id == project_id, ARBVote.round_number == number)))


def check_round(row: ARBVotingRound, expected_number: int):
    if row.number != expected_number:
        raise HTTPException(409, "The voting round changed. Refresh before continuing.")


def get_results(session: Session, demand_id: str, user: dict, number: int | None = None) -> VotingResult:
    project = find_project(session, demand_id)
    rows = all_rounds(session, project.id)
    latest_number = rows[-1].number if rows else 1
    chosen_number = number if number is not None else latest_number
    row = next((item for item in rows if item.number == chosen_number), None)
    if row is None and not (not rows and chosen_number == 1):
        raise HTTPException(404, "Voting round not found.")
    status = row.status if row else "Open"
    current = chosen_number == latest_number
    admin = has_role(user, "Admin") and voter_identity(user) is not None
    votes = round_votes(session, project.id, chosen_number)
    votes.sort(key=lambda vote: (not bool(vote.voter_name), (vote.voter_name or "").casefold(), str(vote.voter_object_id)))
    oid = voter_identity(user)
    own = next((vote for vote in votes if vote.voter_object_id == oid), None)
    favour = sum(vote.choice == "For" for vote in votes)
    against = sum(vote.choice == "Against" for vote in votes)
    return VotingResult(
        round_number=chosen_number, current_round_number=latest_number,
        status=status, outcome=row.outcome if row else None,
        closed_at=row.closed_at if row else None, closed_by_name=row.closed_by_name if row else None,
        reopen_reason=row.reopen_reason if row else None,
        can_close=admin and current and status == "Open",
        can_reopen=admin and current and status == "Closed",
        rounds=[RoundSummary(number=item.number, status=item.status, outcome=item.outcome,
            opened_at=item.opened_at, opened_by_name=item.opened_by_name, reopen_reason=item.reopen_reason,
            closed_at=item.closed_at, closed_by_name=item.closed_by_name) for item in rows],
        in_favour=favour, against=against, total=len(votes),
        can_vote=can_vote(user) and current and status == "Open",
        my_vote=RecordedVote(choice=own.choice, reason=own.reason, revision=own.revision,
            recorded_at=own.recorded_at) if own else None,
        votes=[VoterSummary(voter_object_id=vote.voter_object_id, voter_name=vote.voter_name,
            choice=vote.choice, reason=vote.reason, revision=vote.revision, recorded_at=vote.recorded_at) for vote in votes],
    )


def submit_vote(session: Session, demand_id: str, data: SubmitVote, user: dict) -> VotingResult:
    oid = require_voter(user)
    display_name = voter_name(user)
    try:
        with session.begin():
            project = find_project(session, demand_id, lock=True)
            row = active_round(session, project.id)
            check_round(row, data.round_number)
            if row.status != "Open":
                raise HTTPException(409, "Voting is closed. Votes cannot be changed.")
            vote = session.scalar(select(ARBVote).where(ARBVote.project_id == project.id,
                ARBVote.round_number == row.number, ARBVote.voter_object_id == oid))
            if data.expected_revision != (vote.revision if vote else 0):
                raise HTTPException(409, "Your vote changed. Refresh the results before voting again.")
            effective_name = display_name or (vote.voter_name if vote is not None else None)
            if vote is None:
                vote = ARBVote(project_id=project.id, round_number=row.number, voter_object_id=oid,
                    choice=data.choice, reason=data.reason, voter_name=effective_name, recorded_at=utc_now())
                session.add(vote)
            elif vote.choice != data.choice or vote.reason != data.reason or vote.voter_name != effective_name:
                vote.choice = data.choice
                vote.reason = data.reason
                vote.voter_name = effective_name
                vote.recorded_at = utc_now()
            else:
                return get_results(session, demand_id, user)
            session.flush()
            session.add(ARBVoteEvent(vote_id=vote.id, revision=vote.revision, choice=vote.choice,
                reason=vote.reason, voter_name=vote.voter_name, recorded_at=vote.recorded_at))
            session.flush()
        return get_results(session, demand_id, user)
    except StaleDataError:
        raise HTTPException(409, "Your vote changed. Refresh before voting again.") from None
    except IntegrityError as exc:
        if any(code in str(exc.orig) for code in ("2601", "2627", "UNIQUE constraint failed")):
            raise HTTPException(409, "The voting round changed. Refresh before continuing.") from None
        raise


def close_round(session: Session, demand_id: str, data: RoundAction, user: dict) -> VotingResult:
    oid = require_identity(user, "Admin", "Only an administrator may close voting.")
    with session.begin():
        project = find_project(session, demand_id, lock=True)
        row = active_round(session, project.id)
        check_round(row, data.round_number)
        if row.status == "Open":
            votes = round_votes(session, project.id, row.number)
            if not votes:
                raise HTTPException(409, "At least one vote is required before closing voting.")
            favour = sum(v.choice == "For" for v in votes)
            against = len(votes) - favour
            row.status = "Closed"
            row.outcome = "Passed" if favour > against else "Returned for review"
            row.closed_in_favour = favour
            row.closed_against = against
            row.closed_at = utc_now()
            row.closed_by_object_id = oid
            row.closed_by_name = voter_name(user)
            session.flush()
    return get_results(session, demand_id, user)


def reopen_round(session: Session, demand_id: str, data: ReopenRound, user: dict) -> VotingResult:
    oid = require_identity(user, "Admin", "Only an administrator may reopen voting.")
    with session.begin():
        project = find_project(session, demand_id, lock=True)
        row = active_round(session, project.id)
        check_round(row, data.round_number)
        if row.status != "Closed":
            raise HTTPException(409, "Voting is already open.")
        session.add(ARBVotingRound(project_id=project.id, number=row.number + 1,
            status="Open", opened_by_object_id=oid, opened_by_name=voter_name(user), reopen_reason=data.reason))
        session.flush()
    return get_results(session, demand_id, user)
