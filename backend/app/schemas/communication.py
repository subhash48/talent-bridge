"""Candidate communication: SLA rules, each application's communication health, and what needs attention."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from app.core.enums import ApplicationStage, CommunicationRuleKey, CommunicationStatus, DraftStatus
from app.schemas.common import APIModel, CandidateRef, OptionalText, Timestamp
from app.schemas.message import MessageRead
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


DraftReason = CommunicationRuleKey | Literal["manual"]


class DraftCreate(APIModel):
    application_id: UUID
    # Default: the first rule needing attention, or a general update when none does.
    reason: DraftReason | None = None
    instructions: OptionalText(500) = None  # anything the recruiter wants it to say


class DraftUpdate(APIModel):
    subject: Annotated[str, Field(min_length=1, max_length=200)]
    body: Annotated[str, Field(min_length=1, max_length=5000)]


class DraftSend(APIModel):
    """The recruiter's approval, with any last edits."""

    subject: OptionalText(200) = None
    body: OptionalText(5000) = None


class DraftRead(APIModel):
    """An update the AI drafted. Never sent until a recruiter sends it."""

    id: UUID
    application_id: UUID
    reason: DraftReason
    status: DraftStatus
    subject: str
    body: str
    edited: bool  # the recruiter changed what the AI wrote
    model_name: str | None = None
    message_id: UUID | None = None  # once sent
    created_at: Timestamp
    updated_at: Timestamp
    sent_at: Timestamp | None = None
    discarded_at: Timestamp | None = None


class DraftSent(APIModel):
    draft: DraftRead
    message: MessageRead  # its delivery says whether it was emailed


class AttentionItem(APIModel):
    """One application on the recruiter's Needs Attention list."""

    candidate: CandidateRef
    stage: ApplicationStage
    candidate_status: str
    last_update_at: Timestamp | None = None
    days_since_update: int
    reasons: list[AttentionRead]
    draft: DraftRead | None = None  # the open draft, if one was written


class AttentionList(APIModel):
    items: list[AttentionItem]  # the longest overdue first
    counts: dict[CommunicationRuleKey, int]  # applications per rule
    upcoming: int  # applications whose next rule is due within a day


class RuleCompliance(APIModel):
    rule: CommunicationRuleKey
    title: str
    met: int  # obligations met on time
    total: int  # obligations whose window has passed


class CommunicationAnalytics(APIModel):
    """Are candidates hearing from us, and on time? Over the last `days` days, unless it says now."""

    days: int
    since: Timestamp
    needs_attention: int  # now: applications where a rule's threshold has passed
    unanswered_messages: int  # now: applications with a candidate message waiting for a reply
    median_hours_between_updates: float | None = None
    sla_compliance: float | None = None  # share of obligations met on time, 0 to 1
    compliance: list[RuleCompliance]
    interview_confirmation_rate: float | None = None  # interviews in the period and the coming week
    interviews_confirmed: int
    interviews_total: int
    updates_sent: int  # recruiter messages to candidates
    emails_sent: int
    emails_failed: int
    drafts_generated: int
    drafts_sent: int  # approved and sent by a recruiter
    drafts_sent_unedited: int
    drafts_discarded: int
    minutes_saved: int  # an estimate: minutes_saved_per_draft for each AI draft sent
    minutes_saved_per_draft: int
