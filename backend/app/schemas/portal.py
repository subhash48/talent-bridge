"""Candidate portal schemas: what a candidate may see about their own application.

These are projections, never the recruiter schemas. Interviewer feedback, stage-change reasons,
engagement, AI analysis, sources and activity metadata have no field here, so they can't leave
the API through the portal. services/candidate_visibility.py builds them.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from app.core.enums import ApplicationStage, InterviewStatus, InterviewType, SenderType
from app.schemas.candidate import Skills
from app.schemas.common import APIModel, OptionalText, Timestamp

StepState = Literal["complete", "current", "upcoming"]
ApplicationStatus = Literal["active", "hired", "closed"]
ActivityKind = Literal[
    "application", "stage", "interview", "message", "prep", "question", "document", "offer", "profile"
]


class PortalCandidate(APIModel):
    id: UUID
    first_name: str
    last_name: str
    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    headline: str | None = None
    pronouns: str | None = None
    avatar_url: str | None = None
    resume_url: str | None = None
    skills: list[str] = []


class PortalJob(APIModel):
    id: UUID
    title: str
    company: str
    department: str | None = None
    location: str | None = None
    employment_type: str
    description: str | None = None
    hiring_manager: str | None = None


class PortalRecruiter(APIModel):
    name: str
    email: str
    title: str = "Recruiter"


class PortalStep(APIModel):
    """One step of the hiring pipeline as the candidate sees it."""

    stage: ApplicationStage
    label: str
    state: StepState
    reached_at: Timestamp | None = None


class PortalApplication(APIModel):
    id: UUID
    stage: ApplicationStage
    stage_label: str
    status: ApplicationStatus
    applied_at: Timestamp
    updated_at: Timestamp
    steps: list[PortalStep]
    next_step: str


class PortalInterview(APIModel):
    """Logistics only. Interviewer feedback (interviews.notes) is never part of it."""

    id: UUID
    title: str
    interview_type: InterviewType
    scheduled_at: Timestamp
    duration_minutes: int
    status: InterviewStatus
    meeting_url: str | None = None  # only while the interview is upcoming
    interviewers: list[str] = []
    confirmed_at: Timestamp | None = None
    upcoming: bool  # scheduled and not over yet
    can_confirm: bool


class PortalMessage(APIModel):
    id: UUID
    sender_type: SenderType
    sender_name: str
    content: str
    created_at: Timestamp
    read_at: Timestamp | None = None


class PortalActivity(APIModel):
    """A timeline entry in the candidate's words. Recruiter-written text never passes through."""

    id: UUID
    kind: ActivityKind
    title: str
    created_at: Timestamp


class CandidateMe(APIModel):
    """GET /candidate/me: everything the portal home and its navigation need."""

    company: str
    candidate: PortalCandidate
    application: PortalApplication | None = None
    job: PortalJob | None = None
    recruiter: PortalRecruiter | None = None
    next_interview: PortalInterview | None = None
    unread_messages: int = 0
    latest_message: PortalMessage | None = None  # the latest message from the hiring team
    recent_activity: list[PortalActivity] = []  # newest first


class CandidateApplicationDetail(APIModel):
    application: PortalApplication
    job: PortalJob
    recruiter: PortalRecruiter | None = None
    timeline: list[PortalActivity]  # oldest first


class MessageThread(APIModel):
    recruiter: PortalRecruiter | None = None
    unread: int
    messages: list[PortalMessage]  # oldest first


class PortalMessageCreate(APIModel):
    content: Annotated[str, Field(min_length=1, max_length=5000)]


class ProfileUpdate(APIModel):
    """The only fields a candidate may change. Anything else, such as stage or job, is a 422."""

    model_config = ConfigDict(extra="forbid")

    phone: OptionalText(40) = None
    location: OptionalText(200) = None
    headline: OptionalText(300) = None
    skills: Skills | None = None

    @field_validator("skills")
    @classmethod
    def _unique_skills(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None


# Candidate assistant


class PrepContent(APIModel):
    """What a provider returns for interview prep."""

    interview_format: str
    what_to_expect: list[str] = []
    role_focus: list[str] = []
    topics_to_review: list[str] = []
    company_info: list[str] = []
    questions_to_ask: list[str] = []
    practice_questions: list[str] = []


class CandidatePrep(PrepContent):
    """GET /candidate/prep. company_info is always the company-approved facts, never model text."""

    interview: PortalInterview | None = None
    role: str
    company: str
    model_name: str


UTCOffset = Annotated[int, Field(ge=-840, le=840, description="Minutes ahead of UTC, e.g. 60 for BST")]


class CandidateAskRequest(APIModel):
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    utc_offset_minutes: UTCOffset | None = None


class AssistContent(APIModel):
    answer: str


class CandidateAskResponse(AssistContent):
    model_name: str
