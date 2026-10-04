"""Portal visits and active time.

The portal sends a heartbeat about every 30 seconds, and only while its tab is visible and the
candidate has used it recently (frontend/lib/engagement.ts). The server credits the time since the
previous heartbeat, as it measured it:

- sooner than min_interval: a duplicate, ignored
- within idle_timeout: up to max_credit seconds
- longer (a hidden tab, an idle computer, a page left open overnight): nothing
- one visit counts for at most session_cap

So the browser never reports a duration, and nothing but recent, visible use adds time. Callers check
that the application belongs to the signed-in candidate before calling in here.
"""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import insert_if_absent
from app.core.enums import EngagementEventType
from app.models import PortalSession
from app.models.base import utcnow
from app.services.engagement.config import DEFAULT_CONFIG, SessionConfig
from app.services.engagement.events import record_event


def heartbeat_credit(
    last_active_at: datetime, active_seconds: int, now: datetime, config: SessionConfig = DEFAULT_CONFIG.sessions
) -> int | None:
    """Seconds to add for a heartbeat at `now`, or None if it's a duplicate to ignore."""
    gap = now - last_active_at
    if gap < config.min_interval:
        return None
    if gap > config.idle_timeout:
        return 0
    credit = int(min(gap, config.max_credit).total_seconds())
    room = int(config.session_cap.total_seconds()) - active_seconds
    return max(0, min(credit, room))


async def start_session(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID,
    visit_id: uuid.UUID,
    *,
    auth_session_id: str | None = None,
    now: datetime | None = None,
) -> PortalSession:
    """The visit's row for this application, created on first use. Commits."""
    now = now or utcnow()
    new_visit = not await session.scalar(
        select(PortalSession.id)
        .where(PortalSession.candidate_id == candidate_id, PortalSession.client_session_id == visit_id)
        .limit(1)
    )
    inserted = await insert_if_absent(
        session,
        PortalSession.__table__,
        {
            "id": uuid.uuid4(),
            "candidate_id": candidate_id,
            "application_id": application_id,
            "client_session_id": visit_id,
            "started_at": now,
            "last_active_at": now,
            "active_seconds": 0,
            "page_views": 0,
        },
    )
    row = await _session_row(session, candidate_id, application_id, visit_id)
    assert row is not None
    if inserted and new_visit:
        await record_event(
            session,
            candidate_id,
            EngagementEventType.PORTAL_SESSION_STARTED,
            application_id=application_id,
            session_id=row.id,
            at=now,
        )
    if auth_session_id:
        # Once per Supabase sign-in, however many visits and tabs it spans.
        await record_event(
            session,
            candidate_id,
            EngagementEventType.PORTAL_LOGIN,
            application_id=application_id,
            session_id=row.id,
            dedupe_key=f"portal_login:{auth_session_id}",
            at=now,
        )
    await session.commit()
    return row


async def heartbeat(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID,
    visit_id: uuid.UUID,
    *,
    end: bool = False,
    now: datetime | None = None,
    config: SessionConfig = DEFAULT_CONFIG.sessions,
) -> int:
    """Credit active time since the last heartbeat. Returns the seconds added. Commits."""
    now = now or utcnow()
    row = await _session_row(session, candidate_id, application_id, visit_id)
    if row is None:
        await start_session(session, candidate_id, application_id, visit_id, now=now)
        return 0
    credit = heartbeat_credit(row.last_active_at, row.active_seconds, now, config)
    if credit is None:
        return 0  # a duplicate; the next one on schedule counts the time
    values: dict[str, object] = {
        "last_active_at": now,
        "active_seconds": PortalSession.active_seconds + credit,
        "ended_at": now if end else None,
    }
    # Only if nobody else credited the same stretch in the meantime.
    result = await session.execute(
        update(PortalSession)
        .where(PortalSession.id == row.id, PortalSession.last_active_at == row.last_active_at)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return credit if result.rowcount else 0  # type: ignore[attr-defined]


async def visit_row_id(
    session: AsyncSession, candidate_id: uuid.UUID, application_id: uuid.UUID, visit_id: uuid.UUID
) -> uuid.UUID | None:
    row = await _session_row(session, candidate_id, application_id, visit_id)
    return row.id if row else None


async def add_page_view(session: AsyncSession, row_id: uuid.UUID) -> None:
    await session.execute(
        update(PortalSession).where(PortalSession.id == row_id).values(page_views=PortalSession.page_views + 1)
    )


async def _session_row(
    session: AsyncSession, candidate_id: uuid.UUID, application_id: uuid.UUID, visit_id: uuid.UUID
) -> PortalSession | None:
    return await session.scalar(
        select(PortalSession)
        .where(
            PortalSession.candidate_id == candidate_id,
            PortalSession.application_id == application_id,
            PortalSession.client_session_id == visit_id,
        )
        .execution_options(populate_existing=True)
    )
