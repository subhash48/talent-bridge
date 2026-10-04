"""Candidate schemas.

A candidate is a person. The pipeline row (CandidateListItem) is one of their applications,
because stage, activity, engagement and interviews all belong to an application.
"""

from typing import Annotated
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from app.core.enums import ApplicationStage, EngagementLevel, PortalAccountStatus
from app.schemas.activity import ActivityBrief, ActivityRead
from app.schemas.ai import AIAnalysisRead
from app.schemas.application import ApplicationBrief, ApplicationRead, Origin, StageHistoryRead
from app.schemas.common import APIModel, OptionalText, OptionalURL, Timestamp
from app.schemas.interview import InterviewBrief, InterviewRead
from app.schemas.job import JobBrief, JobRead
from app.schemas.message import MessageRead

Name = Annotated[str, Field(min_length=1, max_length=100)]
Skills = Annotated[list[Annotated[str, Field(min_length=1, max_length=60)]], Field(max_length=30)]


class CandidateCreate(APIModel):
    """Create a person and, when job_id is given, their application to that job."""

    first_name: Name
    last_name: Name
    email: EmailStr
    phone: OptionalText(40) = None
    location: OptionalText(200) = None
    avatar_url: OptionalURL = None
    headline: OptionalText(300) = None
    resume_url: OptionalURL = None
    pronouns: OptionalText(40) = None
    skills: Skills = []

    job_id: UUID | None = None
    stage: ApplicationStage = ApplicationStage.SOURCED
    source: OptionalText(100) = None

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("skills")
    @classmethod
    def _unique_skills(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class CandidateRead(APIModel):
    id: UUID
    external_id: str | None = None
    first_name: str
    last_name: str
    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    headline: str | None = None
    resume_url: str | None = None
    pronouns: str | None = None
    skills: list[str] = []
    portal_status: PortalAccountStatus = PortalAccountStatus.NOT_REQUIRED
    created_at: Timestamp
    updated_at: Timestamp


class EngagementRead(APIModel):
    """How the candidate has engaged with our process, never a judgement of the candidate. The full
    breakdown is GET /candidates/{id}/engagement. follow_up_reason is what the recruiter owes them."""

    level: EngagementLevel
    score: int | None = None  # null while there's too little data
    label: str
    last_active_at: Timestamp | None = None  # in the portal, for this application
    follow_up_reason: str | None = None


class CandidateListItem(APIModel):
    """One row of the recruiter pipeline: an application with its person and job."""

    application_id: UUID
    candidate: CandidateRead
    job: JobBrief
    stage: ApplicationStage
    source: str | None = None
    origin: Origin
    applied_at: Timestamp
    updated_at: Timestamp
    archived_at: Timestamp | None = None
    last_activity: ActivityBrief | None = None
    engagement: EngagementRead
    next_interview: InterviewBrief | None = None


class CandidateDetail(APIModel):
    """Everything the candidate panel shows, for one of the candidate's applications."""

    candidate: CandidateRead
    application: ApplicationRead | None = None
    job: JobRead | None = None
    stage: ApplicationStage | None = None
    engagement: EngagementRead | None = None
    next_interview: InterviewRead | None = None
    activity: list[ActivityRead] = []  # newest first
    interviews: list[InterviewRead] = []  # by scheduled time
    messages: list[MessageRead] = []  # oldest first
    stage_history: list[StageHistoryRead] = []  # newest first
    applications: list[ApplicationBrief] = []
    ai_analysis: AIAnalysisRead | None = None
