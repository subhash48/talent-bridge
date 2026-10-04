"""Candidate engagement: what recruiters see (the breakdown) and what the portal sends (events).

The breakdown is recruiter-only. No candidate portal schema has a field for it.
"""

from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from app.core.enums import (
    CLIENT_ENGAGEMENT_EVENTS,
    EngagementEventType,
    EngagementLevel,
    PortalAccountStatus,
    PortalPage,
)
from app.schemas.common import APIModel, Timestamp

ENGAGEMENT_NOTE = (
    "Operational information about how the candidate has engaged with the process. It is not a measure "
    "of candidate quality and is never used to rank, advance or reject anyone."
)


class PortalActivityPart(APIModel):
    score: int
    max: int
    neutral: bool
    sessions: int
    active_minutes: int
    meaningful_views: int
    last_active_at: Timestamp | None = None


class ResponsivenessPart(APIModel):
    score: int
    max: int
    neutral: bool
    response_opportunities: int
    responses: int
    pending: int
    median_response_minutes: int | None = None
    last_response_minutes: int | None = None


class CommunicationPart(APIModel):
    score: int
    max: int
    initiated_messages: int
    confirmations: int
    confirmation_opportunities: int
    thank_you_notes: int
    follow_ups: int


class PortalOverview(APIModel):
    """The candidate's portal use across all their applications."""

    visits: int
    active_minutes: int
    last_active_at: Timestamp | None = None


class PortalAccess(APIModel):
    status: PortalAccountStatus
    invited_at: Timestamp | None = None
    activated_at: Timestamp | None = None
    problem: str | None = None  # a safe summary when an invitation failed or is waiting


class PortalActionRead(APIModel):
    label: str
    occurred_at: Timestamp  # the latest time, when repeats are counted together
    count: int = 1


class EngagementBreakdown(APIModel):
    """GET /candidates/{id}/engagement: one application's engagement and why it scored as it did."""

    candidate_id: UUID
    application_id: UUID | None = None
    score: int | None = None  # null while there's too little data to judge
    label: str
    level: EngagementLevel
    sufficient_data: bool
    portal_activity: PortalActivityPart
    responsiveness: ResponsivenessPart
    communication: CommunicationPart
    proactive_actions: int
    overall: PortalOverview
    portal_access: PortalAccess
    recent_portal_activity: list[PortalActionRead] = []
    formula_version: str
    note: str = ENGAGEMENT_NOTE


# What the portal sends


class PortalVisitIn(APIModel):
    """A heartbeat or the start or end of a visit. session_id is random per browser tab."""

    model_config = ConfigDict(extra="forbid")

    session_id: UUID
    application_id: UUID


class ClientEngagementEvent(APIModel):
    model_config = ConfigDict(extra="forbid")

    type: EngagementEventType
    application_id: UUID
    session_id: UUID | None = None
    page: PortalPage | None = None
    interview_id: UUID | None = None

    @field_validator("type")
    @classmethod
    def _client_type(cls, value: EngagementEventType) -> EngagementEventType:
        if value not in CLIENT_ENGAGEMENT_EVENTS:
            raise ValueError("this event is recorded by the server, not sent by the portal")
        return value


class EngagementEventBatch(APIModel):
    model_config = ConfigDict(extra="forbid")

    events: Annotated[list[ClientEngagementEvent], Field(min_length=1, max_length=20)]
