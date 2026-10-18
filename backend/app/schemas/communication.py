"""Candidate communication: SLA rules, each application's communication health, and what needs attention."""

from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.core.enums import ApplicationStage, CommunicationRuleKey, CommunicationStatus
from app.schemas.common import APIModel, CandidateRef, Timestamp
from app.services.communication.rules import MAX_THRESHOLD_HOURS


class EmailDeliveryRead(APIModel):
    """Whether recruiter messages are also emailed. Without a provider they reach the portal only."""

    configured: bool
    provider: str | None = None
    sender: str | None = None  # the From address candidates see


class CommunicationRuleRead(APIModel):
    key: CommunicationRuleKey
    title: str
    description: str
    unit: str  # what threshold_hours counts
    enabled: bool
    threshold_hours: int
    default_hours: int


class CommunicationRuleUpdate(APIModel):
    enabled: bool
    threshold_hours: Annotated[int, Field(ge=0, le=MAX_THRESHOLD_HOURS)]


class AttentionRead(APIModel):
    """One rule whose threshold has passed."""

    rule: CommunicationRuleKey
    title: str
    detail: str
    since: Timestamp  # when the clock started
    due_at: Timestamp
    interview_id: UUID | None = None
    message_id: UUID | None = None


class OpenQuestionRead(APIModel):
    message_id: UUID
    asked_at: Timestamp
    excerpt: str
    count: int


class InterviewCheckRead(APIModel):
    interview_id: UUID
    title: str
    scheduled_at: Timestamp
    confirmed: bool


class FollowUpCheckRead(APIModel):
    interview_id: UUID
    title: str
    ended_at: Timestamp
    followed_up: bool


class StageChangeRead(APIModel):
    stage: ApplicationStage
    changed_at: Timestamp
    told: bool


class CommunicationHealthRead(APIModel):
    """What one candidate has heard from us and what they're waiting for. Recruiter-only."""

    status: CommunicationStatus
    candidate_status: str  # the status the candidate sees in their portal
    last_update_at: Timestamp | None = None
    waiting_since: Timestamp
    days_since_update: int
    open_question: OpenQuestionRead | None = None
    next_interview: InterviewCheckRead | None = None
    last_interview: FollowUpCheckRead | None = None
    stage_change: StageChangeRead | None = None
    attention: list[AttentionRead] = []
    next_due_at: Timestamp | None = None


class CommunicationSummary(APIModel):
    """A pipeline row's communication column."""

    status: CommunicationStatus
    last_update_at: Timestamp | None = None
    days_since_update: int
    reason: str | None = None  # the first rule needing attention


class AttentionItem(APIModel):
    """One application on the recruiter's Needs Attention list."""

    candidate: CandidateRef
    stage: ApplicationStage
    candidate_status: str
    last_update_at: Timestamp | None = None
    days_since_update: int
    reasons: list[AttentionRead]


class AttentionList(APIModel):
    items: list[AttentionItem]  # the longest overdue first
    counts: dict[CommunicationRuleKey, int]  # applications per rule
    upcoming: int  # applications whose next rule is due within a day
