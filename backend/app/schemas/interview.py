"""Interview schemas: status enum, staff record, candidate projection (ARCHITECTURE.md 7.2, 8.3).

Mirrors frontend/types/interview.ts. Portal (candidate-facing) models are separate classes in this
file and never include internal fields such as feedback (10.2 L4).
"""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class InterviewStatus(StrEnum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    RESCHEDULE_REQUESTED = "reschedule_requested"
    COMPLETED = "completed"
    CANCELED = "canceled"
    NO_SHOW = "no_show"


class Interview(BaseModel):
    """Staff view of an interview."""

    id: UUID
    application_id: UUID
    title: str
    interview_type: str
    scheduled_at: datetime
    duration_minutes: int = 60
    meeting_url: str | None = None
    status: InterviewStatus
    confirmed_at: datetime | None = None


class PortalInterviewer(BaseModel):
    """Public interviewer fields, shown only for the candidate's own interviews (6.3)."""

    name: str
    title: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class PortalInterview(BaseModel):
    """Candidate projection of one of their own interviews."""

    id: UUID
    title: str
    starts_at: datetime
    duration_minutes: int
    meeting_url: str | None = None
    status: InterviewStatus
    interviewers: list[PortalInterviewer] = []
