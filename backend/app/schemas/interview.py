"""Interview schemas. Status is scheduled, completed or cancelled; confirmed_at records the
candidate's confirmation, and notes hold interviewer feedback."""

from typing import Annotated
from uuid import UUID

from pydantic import Field, field_validator

from app.core.enums import InterviewStatus, InterviewType
from app.schemas.common import APIModel, CandidateRef, OptionalText, OptionalURL, Timestamp

Interviewers = Annotated[list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=10)]
Duration = Annotated[int, Field(ge=15, le=480)]


class InterviewCreate(APIModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    interview_type: InterviewType = InterviewType.VIDEO
    scheduled_at: Timestamp
    duration_minutes: Duration = 60
    meeting_url: OptionalURL = None
    notes: OptionalText(5000) = None
    interviewers: Interviewers = []


class InterviewUpdate(APIModel):
    """Only the fields sent are changed. confirmed=true records the candidate's confirmation."""

    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    interview_type: InterviewType | None = None
    scheduled_at: Timestamp | None = None
    duration_minutes: Duration | None = None
    status: InterviewStatus | None = None
    meeting_url: OptionalURL = None
    notes: OptionalText(5000) = None
    interviewers: Interviewers | None = None
    confirmed: bool | None = None

    @field_validator("title", "interview_type", "scheduled_at", "duration_minutes", "status", mode="before")
    @classmethod
    def _required_if_sent(cls, value: object) -> object:
        if value is None:
            raise ValueError("can't be empty")
        return value


class InterviewBrief(APIModel):
    id: UUID
    title: str
    interview_type: InterviewType
    scheduled_at: Timestamp
    duration_minutes: int
    status: InterviewStatus


class InterviewRead(InterviewBrief):
    application_id: UUID
    meeting_url: str | None = None
    notes: str | None = None
    interviewers: list[str] = []
    confirmed_at: Timestamp | None = None
    created_at: Timestamp
    updated_at: Timestamp


class InterviewListItem(InterviewRead):
    """An interview on the recruiter's schedule, with who it's with."""

    candidate: CandidateRef
