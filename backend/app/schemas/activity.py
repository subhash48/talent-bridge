"""Activity timeline schemas."""

from typing import Any
from uuid import UUID

from pydantic import AliasChoices, Field

from app.schemas.common import APIModel, Timestamp


class ActivityBrief(APIModel):
    id: UUID
    activity_type: str
    title: str
    created_at: Timestamp


class ActivityRead(ActivityBrief):
    application_id: UUID
    description: str | None = None
    # The model attribute is "meta" (SQLAlchemy reserves "metadata"); the API field is "metadata".
    metadata: dict[str, Any] | None = Field(default=None, validation_alias=AliasChoices("meta", "metadata"))
