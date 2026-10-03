"""Recruiting orchestration: the single path that records events and refreshes insights.

One transaction per command or accepted telemetry event (ARCHITECTURE.md 5.2, 5.3): validate,
authorize, dedupe or throttle, append, recompute engagement and next action, upsert
application_insights, then ping change_feed.
"""

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Principal
from app.schemas.event import EventType


@dataclass(frozen=True)
class NewEvent:
    event_type: EventType
    application_id: UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str | None = None


async def record_event(session: AsyncSession, principal: Principal, event: NewEvent) -> UUID | None:
    """Record one event and refresh its application's insights. Returns None when throttled."""
    raise NotImplementedError  # TODO: implement the unit of work in ARCHITECTURE.md 5.3
