"""The application timeline. Every change a recruiter should know about records an entry in the
same transaction as the change itself."""

import uuid
from datetime import datetime
from typing import Any

from pydantic_core import to_jsonable_python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType
from app.core.errors import NotFoundError
from app.models import Application, CandidateActivity
from app.models.base import utcnow
from app.schemas.activity import ActivityRead


def record_activity(
    session: AsyncSession,
    application_id: uuid.UUID,
    activity_type: ActivityType,
    title: str,
    *,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    at: datetime | None = None,
) -> CandidateActivity:
    """Add a timeline entry to the session. The caller commits."""
    activity = CandidateActivity(
        application_id=application_id,
        activity_type=activity_type.value,
        title=title,
        description=description,
        meta=to_jsonable_python(metadata) if metadata else None,
        created_at=at or utcnow(),
    )
    session.add(activity)
    return activity


async def list_activity(
    session: AsyncSession, application_id: uuid.UUID, *, limit: int = 50, offset: int = 0
) -> list[ActivityRead]:
    """Newest first."""
    if await session.get(Application, application_id) is None:
        raise NotFoundError("Application not found.")
    rows = await session.scalars(
        select(CandidateActivity)
        .where(CandidateActivity.application_id == application_id)
        .order_by(CandidateActivity.created_at.desc(), CandidateActivity.id)
        .limit(limit)
        .offset(offset)
    )
    return [ActivityRead.model_validate(row) for row in rows]
