import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, UUIDPrimaryKey, utcnow


class PortalSession(UUIDPrimaryKey, Base):
    """One portal visit in one application's context (migration 012).

    client_session_id is a random id the portal keeps per browser tab, so reloading a page is the same
    visit. Switching applications starts a row for the other application under the same visit, which
    keeps time on Job A from counting for Job B. active_seconds only grows from heartbeats the server
    times itself (services/engagement/sessions.py); nothing the browser reports is a duration.
    """

    __tablename__ = "portal_sessions"
    __table_args__ = (
        UniqueConstraint("candidate_id", "client_session_id", "application_id", name="portal_sessions_visit_key"),
        Index("portal_sessions_candidate_idx", "candidate_id", "started_at"),
        Index("portal_sessions_application_idx", "application_id", "started_at"),
    )

    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    client_session_id: Mapped[uuid.UUID]
    started_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    last_active_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    ended_at: Mapped[datetime | None]
    active_seconds: Mapped[int] = mapped_column(default=0)
    page_views: Mapped[int] = mapped_column(default=0)


class CandidateEngagementEvent(UUIDPrimaryKey, Base):
    """An explicit first-party portal action (core.enums.EngagementEventType). Append-only.

    Metadata holds identifiers and page names only: never message text, keystrokes, pointer
    positions or anything about the browser.
    """

    __tablename__ = "candidate_engagement_events"
    __table_args__ = (
        Index("candidate_engagement_events_candidate_idx", "candidate_id", "occurred_at"),
        Index("candidate_engagement_events_application_idx", "application_id", "occurred_at"),
    )

    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    application_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("portal_sessions.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(Text)  # an EngagementEventType value
    source: Mapped[str] = mapped_column(Text, default="candidate_portal")  # candidate_portal or server
    occurred_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONType)
    # Set for events that may happen once (a login per auth session); the unique index enforces it.
    dedupe_key: Mapped[str | None] = mapped_column(Text, unique=True)
