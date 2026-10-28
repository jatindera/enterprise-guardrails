from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    CheckConstraint,
    MetaData,
    Unicode,
    UnicodeText,
    Uuid,
)
from sqlalchemy.dialects.mssql import DATETIMEOFFSET
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    demand_id: Mapped[str] = mapped_column(
        Unicode(64),
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        Unicode(300),
        unique=True,
        nullable=False,
    )

    business_function: Mapped[str] = mapped_column(
        Unicode(200),
        nullable=False,
    )

    assigned_ea: Mapped[str] = mapped_column(
        Unicode(320),
        nullable=False,
    )

    # These fields are populated only after a verified Entra lookup.
    assigned_rai_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    additional_rai_email: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    additional_rai_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    assigned_security_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    additional_security_email: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    additional_security_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    assigned_ea_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    additional_ea_email: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    additional_ea_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)

    assigned_security: Mapped[str] = mapped_column(
        Unicode(320), nullable=False, default="Not assigned", server_default="Not assigned",
    )
    assigned_rai: Mapped[str] = mapped_column(
        Unicode(320), nullable=False, default="Chris Cawthon", server_default="Chris Cawthon",
    )

    arb_required: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="0")

    revision: Mapped[int] = mapped_column(
        nullable=False,
        default=1,
    )

    created_at: Mapped[datetime] = mapped_column(
        DATETIMEOFFSET,
        nullable=False,
        default=utc_now,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DATETIMEOFFSET,
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    __mapper_args__ = {
        "version_id_col": revision,
    }


class ProjectIntakeSnapshot(Base):
    __tablename__ = "project_intake_snapshots"

    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    source_file_name: Mapped[str] = mapped_column(
        Unicode(260),
        nullable=False,
    )

    markdown: Mapped[str] = mapped_column(
        UnicodeText,
        nullable=False,
    )

    imported_at: Mapped[datetime] = mapped_column(
        DATETIMEOFFSET,
        nullable=False,
        default=utc_now,
    )


class ARBVotingRound(Base):
    __tablename__ = "arb_voting_rounds"
    __table_args__ = (
        UniqueConstraint("project_id", "number", name="uq_arb_voting_rounds_project_number"),
        CheckConstraint("status IN ('Open', 'Closed')", name="status"),
        CheckConstraint("number >= 1", name="number"),
        CheckConstraint("number = 1 OR (reopen_reason IS NOT NULL AND LTRIM(RTRIM(reopen_reason)) <> '')", name="reopen_reason"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    number: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(Unicode(6), nullable=False, default="Open")
    opened_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False, default=utc_now)
    opened_by_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    opened_by_name: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    reopen_reason: Mapped[str | None] = mapped_column(Unicode(2000), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)
    closed_by_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    closed_by_name: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    outcome: Mapped[str | None] = mapped_column(Unicode(30), nullable=True)
    closed_in_favour: Mapped[int | None] = mapped_column(nullable=True)
    closed_against: Mapped[int | None] = mapped_column(nullable=True)


class ARBVote(Base):
    __tablename__ = "arb_votes"
    __table_args__ = (
        UniqueConstraint("project_id", "round_number", "voter_object_id", name="uq_arb_votes_round_voter"),
        ForeignKeyConstraint(["project_id", "round_number"], ["arb_voting_rounds.project_id", "arb_voting_rounds.number"],
                             name="fk_arb_votes_round"),
        CheckConstraint("choice IN ('For', 'Against')", name="choice"),
        CheckConstraint("choice <> 'Against' OR (reason IS NOT NULL AND LTRIM(RTRIM(reason)) <> '')", name="reason"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(nullable=False, default=1)
    voter_object_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    voter_name: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    choice: Mapped[str] = mapped_column(Unicode(7), nullable=False)
    reason: Mapped[str | None] = mapped_column(Unicode(2000), nullable=True)
    revision: Mapped[int] = mapped_column(nullable=False, default=1)
    recorded_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False, default=utc_now)
    __mapper_args__ = {"version_id_col": revision}


class ARBVoteEvent(Base):
    __tablename__ = "arb_vote_events"
    __table_args__ = (UniqueConstraint("vote_id", "revision", name="uq_arb_vote_events_vote_revision"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    vote_id: Mapped[UUID] = mapped_column(ForeignKey("arb_votes.id"), nullable=False)
    revision: Mapped[int] = mapped_column(nullable=False)
    voter_name: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    choice: Mapped[str] = mapped_column(Unicode(7), nullable=False)
    reason: Mapped[str | None] = mapped_column(Unicode(2000), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False)
