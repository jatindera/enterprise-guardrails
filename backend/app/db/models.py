from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    CheckConstraint,
    MetaData,
    Numeric,
    BigInteger,
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

    production_status: Mapped[str] = mapped_column(Unicode(20), nullable=False, default="Not deployed", server_default="Not deployed")
    go_live_date: Mapped[date | None] = mapped_column(nullable=True)
    production_comments: Mapped[str] = mapped_column(Unicode(4000), nullable=False, default="", server_default="")
    production_saved_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)
    production_saved_by: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    production_revision: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")

    gate_required: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="0")

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

    source_system: Mapped[str] = mapped_column(Unicode(32), nullable=False, default="markdown", server_default="markdown")
    source_item_id: Mapped[str | None] = mapped_column(Unicode(512), nullable=True)
    source_url: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    source_modified_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)
    source_etag: Mapped[str | None] = mapped_column(Unicode(512), nullable=True)

    source_file_name: Mapped[str] = mapped_column(
        Unicode(260),
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


class GateDecisionEvent(Base):
    """Append-only decision revisions. Editing inserts a new row."""
    __tablename__ = "gate_decision_events"
    __table_args__ = (
        UniqueConstraint("project_id", "domain", "revision", name="uq_gate_decisions_domain_revision"),
        CheckConstraint("domain IN ('EA', 'Security', 'RAI')", name="domain"),
        CheckConstraint("decision IN ('Approved', 'Conditional approval', 'On hold', 'Rejected', 'Not applicable')", name="decision"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(Unicode(8), nullable=False)
    revision: Mapped[int] = mapped_column(nullable=False)
    decision: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    comments: Mapped[str] = mapped_column(Unicode(4000), nullable=False)
    primary_object_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    reviewer_name: Mapped[str] = mapped_column(Unicode(320), nullable=False)
    actor_object_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    actor_name: Mapped[str] = mapped_column(Unicode(320), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False, default=utc_now)


class GateArtifact(Base):
    __tablename__ = "gate_artifacts"
    __table_args__ = (CheckConstraint("status IN ('Pending', 'Ready')", name="status"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(Unicode(260), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    storage_account: Mapped[str] = mapped_column(Unicode(24), nullable=False)
    container: Mapped[str] = mapped_column(Unicode(63), nullable=False)
    blob_name: Mapped[str] = mapped_column(Unicode(300), nullable=False)
    status: Mapped[str] = mapped_column(Unicode(7), nullable=False)
    uploaded_by_object_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    uploaded_by_name: Mapped[str] = mapped_column(Unicode(320), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False, default=utc_now)
    uploaded_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)


class ProductionDeploymentEvent(Base):
    __tablename__ = "production_deployment_events"
    __table_args__ = (
        UniqueConstraint("project_id", "revision", name="uq_production_events_project_revision"),
        CheckConstraint("production_status IN ('Not deployed', 'In production')", name="status"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    revision: Mapped[int] = mapped_column(nullable=False)
    production_status: Mapped[str] = mapped_column(Unicode(20), nullable=False)
    go_live_date: Mapped[date | None] = mapped_column(nullable=True)
    comments: Mapped[str] = mapped_column(Unicode(4000), nullable=False)
    actor_object_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    actor_name: Mapped[str] = mapped_column(Unicode(320), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, nullable=False, default=utc_now)
    gate_approval_snapshot: Mapped[str] = mapped_column(UnicodeText, nullable=False)


class ProjectIntakeDetail(Base):
    """Typed intake facts for one immutable import version."""
    __tablename__ = "project_intake_details"
    snapshot_id: Mapped[UUID] = mapped_column(ForeignKey("project_intake_snapshots.id"), primary_key=True)
    parser_version: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    parsing_warnings: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="[]")
    title: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    business_function: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    program: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    program_kpis: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    requesting_organization: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    site_location: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    target_project_start: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    target_project_go_live: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    problem_statement: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    value_description: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    desired_business_outcome: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    value_savings_type: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    intake_priority_driver: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    business_priority: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    supported_company_goals: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    ai_initiative: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    level_of_effort: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    priority_level: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    request_type: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    request_subtype: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    product_solution_name: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    vendor_name: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    integrated_systems: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    data_classification: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    regulatory_data: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    deployment_type: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    impacted_users: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    primary_delivery_team: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    engaged_delivery_teams: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    review_meeting_date: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    architecture_assessment_status: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    architecture_assessment_link: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    architecture_assessment_complete_date: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    security_risk_rating: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    security_assessment_status: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    security_assessment_link: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    security_assessment_complete_date: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    ai_effort: Mapped[bool | None] = mapped_column(nullable=True)
    capital_project: Mapped[bool | None] = mapped_column(nullable=True)
    architecture_change: Mapped[bool | None] = mapped_column(nullable=True)
    consulting_services: Mapped[bool | None] = mapped_column(nullable=True)
    integration_needed: Mapped[bool | None] = mapped_column(nullable=True)
    data_classification_change: Mapped[bool | None] = mapped_column(nullable=True)
    create_project_tracker: Mapped[bool | None] = mapped_column(nullable=True)
    architecture_assessment_required: Mapped[bool | None] = mapped_column(nullable=True)
    arb_required: Mapped[bool | None] = mapped_column(nullable=True)
    security_assessment_required: Mapped[bool | None] = mapped_column(nullable=True)
    pre_production_gate_required: Mapped[bool | None] = mapped_column(nullable=True)
    budget_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(19, 2), nullable=True)
    priority_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    expected_user_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class ProjectIntakeField(Base):
    """Source field/paragraph values, scoped by section; includes unknown fields."""
    __tablename__ = "project_intake_fields"
    __table_args__ = (UniqueConstraint("snapshot_id", "ordinal", name="uq_intake_fields_snapshot_ordinal"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    snapshot_id: Mapped[UUID] = mapped_column(ForeignKey("project_intake_snapshots.id"), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(nullable=False)
    section: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    field_name: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    value: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    kind: Mapped[str] = mapped_column(Unicode(16), nullable=False)


class ProjectIntakeStakeholder(Base):
    __tablename__ = "project_intake_stakeholders"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    snapshot_id: Mapped[UUID] = mapped_column(ForeignKey("project_intake_snapshots.id"), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(nullable=False)
    role: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    display_name: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    email: Mapped[str | None] = mapped_column(Unicode(320), nullable=True)
    source_value: Mapped[str] = mapped_column(UnicodeText, nullable=False)


class MeetingPreparationRecord(Base):
    __tablename__ = 'meeting_preparations'
    __table_args__ = (UniqueConstraint('project_id', 'domain'),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id'), nullable=False)
    domain: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    revision: Mapped[int] = mapped_column(default=1, nullable=False)
    current_question_id: Mapped[str | None] = mapped_column(Unicode(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, default=utc_now, nullable=False)
    updated_by: Mapped[str] = mapped_column(Unicode(128), nullable=False)
    __mapper_args__ = {'version_id_col': revision}


class MeetingPreparedQuestion(Base):
    __tablename__ = 'meeting_prepared_questions'
    preparation_id: Mapped[UUID] = mapped_column(ForeignKey('meeting_preparations.id'), primary_key=True)
    id: Mapped[str] = mapped_column(Unicode(64), primary_key=True)
    kind: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    position: Mapped[int] = mapped_column(nullable=False)
    question: Mapped[str] = mapped_column(Unicode(4000), nullable=False)
    reason: Mapped[str] = mapped_column(Unicode(2000), nullable=False)
    priority: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    source: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    selected: Mapped[bool] = mapped_column(nullable=False)
    asked_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)
    asked_order: Mapped[int | None] = mapped_column(nullable=True)


class EAReviewMeeting(Base):
    __tablename__ = 'ea_review_meetings'
    __table_args__ = (UniqueConstraint('project_id', 'number'),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id'), nullable=False, index=True)
    number: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    state: Mapped[str] = mapped_column(Unicode(16), default='Open', nullable=False)
    revision: Mapped[int] = mapped_column(default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, default=utc_now, nullable=False)
    created_by: Mapped[str] = mapped_column(Unicode(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, default=utc_now, nullable=False)
    __mapper_args__ = {'version_id_col': revision}


class EAMeetingTranscript(Base):
    __tablename__ = 'ea_meeting_transcripts'
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    meeting_id: Mapped[UUID] = mapped_column(ForeignKey('ea_review_meetings.id'), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(Unicode(260), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    storage_account: Mapped[str] = mapped_column(Unicode(24), nullable=False)
    container: Mapped[str] = mapped_column(Unicode(63), nullable=False)
    blob_name: Mapped[str] = mapped_column(Unicode(512), nullable=False)
    status: Mapped[str] = mapped_column(Unicode(16), default='Pending', nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, default=utc_now, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(Unicode(128), nullable=False)


class EAMeetingReview(Base):
    __tablename__ = 'ea_meeting_reviews'
    __table_args__ = (UniqueConstraint('meeting_id', 'version'),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    meeting_id: Mapped[UUID] = mapped_column(ForeignKey('ea_review_meetings.id'), nullable=False, index=True)
    version: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    basis_review_id: Mapped[UUID | None] = mapped_column(ForeignKey('ea_meeting_reviews.id'), nullable=True)
    parent_review_id: Mapped[UUID | None] = mapped_column(ForeignKey('ea_meeting_reviews.id'), nullable=True)
    input_digest: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    input_manifest: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    ai_result: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    review_text: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    profile_version: Mapped[str] = mapped_column(Unicode(32), nullable=False)
    execution_mode: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    agent_reference: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DATETIMEOFFSET, default=utc_now, nullable=False)
    created_by: Mapped[str] = mapped_column(Unicode(128), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DATETIMEOFFSET, nullable=True)
    accepted_by: Mapped[str | None] = mapped_column(Unicode(128), nullable=True)
    accepted_by_name: Mapped[str | None] = mapped_column(Unicode(200), nullable=True)
