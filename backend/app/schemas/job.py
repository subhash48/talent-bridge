"""Job schemas. Mirrors frontend/types/job.ts."""

from typing import Annotated
from uuid import UUID

from pydantic import Field, field_validator

from app.core.enums import JobStatus
from app.schemas.common import APIModel, OptionalText, Timestamp

Title = Annotated[str, Field(min_length=1, max_length=200)]


class JobCreate(APIModel):
    title: Title
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    description: OptionalText(5000) = None
    status: JobStatus = JobStatus.OPEN
    employment_type: Annotated[str, Field(min_length=1, max_length=50)] = "Full-time"
    hiring_manager: OptionalText(200) = None
    external_id: OptionalText(200) = None


class JobUpdate(APIModel):
    """Only the fields sent are changed."""

    title: Title | None = None
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    description: OptionalText(5000) = None
    status: JobStatus | None = None
    employment_type: Annotated[str, Field(min_length=1, max_length=50)] | None = None
    hiring_manager: OptionalText(200) = None

    @field_validator("title", "status", "employment_type", mode="before")
    @classmethod
    def _required_if_sent(cls, value: object) -> object:
        if value is None:
            raise ValueError("can't be empty")
        return value


class JobBrief(APIModel):
    id: UUID
    title: str
    department: str | None = None
    location: str | None = None
    status: JobStatus


class JobRead(JobBrief):
    external_id: str | None = None
    description: str | None = None
    employment_type: str
    hiring_manager: str | None = None
    created_at: Timestamp
    updated_at: Timestamp
