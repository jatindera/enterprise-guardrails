from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


    @field_validator("created_at", "updated_at", "imported_at", "recorded_at", "uploaded_at", "production_saved_at", "source_modified_at", check_fields=False)
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        # All application timestamps are UTC. SQLite test doubles may drop
        # timezone information; Azure SQL DATETIMEOFFSET preserves it.
        if value is None:
            return value
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

