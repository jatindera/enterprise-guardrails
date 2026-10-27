from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    ForeignKey,
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