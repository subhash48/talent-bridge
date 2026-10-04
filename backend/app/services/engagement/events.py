"""Engagement events: explicit, first-party portal actions (core.enums.EngagementEventType).

Recorded either by the server, as part of the request that caused them (opening interview prep,
reading messages, signing in), or from the portal's batched POST /candidate/engagement/events, which
accepts only CLIENT_ENGAGEMENT_EVENTS. The candidate always comes from the access token, never the
request body. Repeats within THROTTLE are dropped, so refreshing a page adds nothing.

Metadata is limited to page names and record ids: no message text, keystrokes, pointer positions or
browser details.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import insert_if_absent
from app.core.enums import EngagementEventType
from app.models import CandidateEngagementEvent
from app.models.base import utcnow

THROTTLE = timedelta(minutes=5)


async def record_event(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    event_type: EngagementEventType,
    *,
    application_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    source: str = "server",
    dedupe_key: str | None = None,
    at: datetime | None = None,
) -> bool:
    """Add the event to the session (the caller commits). With dedupe_key, at most once ever."""
    values = {
        "id": uuid.uuid4(),
        "candidate_id": candidate_id,
        "application_id": application_id,
        "session_id": session_id,
        "event_type": event_type.value,
        "source": source,
        "occurred_at": at or utcnow(),
        "meta": metadata or None,
        "dedupe_key": dedupe_key,
    }
    if dedupe_key is not None:
        values["metadata"] = values.pop("meta")
        return await insert_if_absent(session, CandidateEngagementEvent.__table__, values)
    session.add(CandidateEngagementEvent(**values))
    return True


async def record_unless_recent(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    event_type: EngagementEventType,
    *,
    application_id: uuid.UUID | None,
    target: str | None = None,
    session_id: uuid.UUID | None = None,
    source: str = "server",
    metadata: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> bool:
    """Record the event unless the same one (same application and target) happened within THROTTLE."""
    now = now or utcnow()
    query = (
        select(CandidateEngagementEvent.meta)
        .where(
            CandidateEngagementEvent.candidate_id == candidate_id,
            CandidateEngagementEvent.event_type == event_type.value,
            CandidateEngagementEvent.occurred_at > now - THROTTLE,
        )
        .order_by(CandidateEngagementEvent.occurred_at.desc())
        .limit(20)
    )
    query = query.where(
        CandidateEngagementEvent.application_id == application_id
        if application_id is not None
        else CandidateEngagementEvent.application_id.is_(None)
    )
    if any((meta or {}).get("target") == target for meta in await session.scalars(query)):
        return False
    details = {**(metadata or {}), **({"target": target} if target else {})}
    return await record_event(
        session,
        candidate_id,
        event_type,
        application_id=application_id,
        session_id=session_id,
        metadata=details,
        source=source,
        at=now,
    )
