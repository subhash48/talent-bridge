"""Event contract: catalog types, sources, the client allowlist and engagement levels (ARCHITECTURE.md 9).

Mirrors frontend/types/event.ts; keep the EventType order identical. Activity events are staff-only:
there is no portal (candidate-facing) model in this file.
"""

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(StrEnum):
    CANDIDATE_PORTAL_OPENED = "candidate_portal_opened"
    JOB_VIEWED = "job_viewed"
    COMPANY_PAGE_VIEWED = "company_page_viewed"
    TEAM_PAGE_VIEWED = "team_page_viewed"
    RESOURCE_VIEWED = "resource_viewed"
    INTERVIEW_PREP_VIEWED = "interview_prep_viewed"
    OFFER_VIEWED = "offer_viewed"
    INTERVIEW_CONFIRMED = "interview_confirmed"
    INTERVIEW_RESCHEDULE_REQUESTED = "interview_reschedule_requested"
    MESSAGE_RECEIVED = "message_received"
    MESSAGE_SENT = "message_sent"
    AI_QUESTION_ASKED = "ai_question_asked"
    DOCUMENT_UPLOADED = "document_uploaded"
    ASSESSMENT_COMPLETED = "assessment_completed"
    APPLICATION_STAGE_CHANGED = "application_stage_changed"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    ENGAGEMENT_CHANGED = "engagement_changed"
    FOLLOW_UP_RECOMMENDED = "follow_up_recommended"
    AI_DRAFT_GENERATED = "ai_draft_generated"


class EventSource(StrEnum):
    CANDIDATE_PORTAL = "candidate_portal"
    RECRUITER_DASHBOARD = "recruiter_dashboard"
    SYSTEM = "system"
    AI = "ai"


class EngagementLevel(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


# The only types POST /v1/events accepts (9.3).
CLIENT_EMITTABLE: frozenset[EventType] = frozenset(
    {
        EventType.CANDIDATE_PORTAL_OPENED,
        EventType.JOB_VIEWED,
        EventType.COMPANY_PAGE_VIEWED,
        EventType.TEAM_PAGE_VIEWED,
        EventType.RESOURCE_VIEWED,
        EventType.INTERVIEW_PREP_VIEWED,
        EventType.OFFER_VIEWED,
    }
)


class TelemetryEventIn(BaseModel):
    """Body of POST /v1/events. Ids, actor and source are always derived on the server (9.1)."""

    event_type: EventType
    application_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None


class ActivityEvent(BaseModel):
    """A timeline entry as staff see it, with its server-rendered label (9.4)."""

    id: UUID
    application_id: UUID | None = None
    event_type: EventType
    source: EventSource
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime
