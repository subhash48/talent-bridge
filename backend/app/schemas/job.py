"""Job schemas. Mirrors frontend/types/job.ts."""

from typing import Annotated
from uuid import UUID

from pydantic import Field, field_validator

from app.core.enums import JobStatus, Weekday
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
    # A small business's job, in the employer's words (migration 020).
    pay: OptionalText(100) = None
    shift: OptionalText(100) = None
    work_days: Annotated[list[Weekday], Field(max_length=7)] = []
    openings: Annotated[int, Field(ge=1, le=500)] | None = None


class JobUpdate(APIModel):
    """Only the fields sent are changed."""

    title: Title | None = None
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    description: OptionalText(5000) = None
    status: JobStatus | None = None
    employment_type: Annotated[str, Field(min_length=1, max_length=50)] | None = None
    hiring_manager: OptionalText(200) = None
    pay: OptionalText(100) = None
    shift: OptionalText(100) = None
    work_days: Annotated[list[Weekday], Field(max_length=7)] | None = None
    openings: Annotated[int, Field(ge=1, le=500)] | None = None

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
    pay: str | None = None
    shift: str | None = None
    work_days: list[Weekday] = []
    openings: int | None = None
    created_at: Timestamp
    updated_at: Timestamp
