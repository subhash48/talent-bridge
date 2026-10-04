"""The candidate's interviews: listing them and confirming attendance.

Confirming sets confirmed_at on the same interview row the recruiter scheduled and records an
interview_confirmed entry, so the recruiter's schedule and timeline show it straight away.
"""

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType, InterviewStatus
from app.core.errors import BadRequestError, NotFoundError
from app.models import Application, Candidate, Interview
from app.models.base import utcnow
from app.schemas.portal import PortalInterview
from app.services.activity_service import record_activity
from app.services.candidate_portal_service import current_application, owned_application
from app.services.candidate_visibility import present_interview


async def list_interviews(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None
) -> list[PortalInterview]:
    """One application's interviews (default: the one the portal opens on), by scheduled time."""
    if application_id is None:
        application = await current_application(session, candidate.id)
        if application is None:
            return []
    else:
        application = await owned_application(session, candidate, application_id)
    now = utcnow()
    rows = await session.scalars(
        select(Interview)
        .where(Interview.application_id == application.id)
        .order_by(Interview.scheduled_at, Interview.id)
    )
    return [present_interview(row, now) for row in rows]


async def get_interview(session: AsyncSession, candidate: Candidate, interview_id: uuid.UUID) -> PortalInterview:
    return present_interview(await _own_interview(session, candidate, interview_id), utcnow())


async def confirm_interview(session: AsyncSession, candidate: Candidate, interview_id: uuid.UUID) -> PortalInterview:
    """Idempotent: confirming twice keeps the first confirmation and records one timeline entry."""
    interview = await _own_interview(session, candidate, interview_id)
    now = utcnow()
    if interview.status == InterviewStatus.CANCELLED:
        raise BadRequestError(
            "This interview was cancelled, so there's nothing to confirm.", code="interview_cancelled"
        )
    if interview.status == InterviewStatus.COMPLETED or interview.scheduled_at <= now:
        raise BadRequestError("This interview has already taken place.", code="interview_in_past")

    # Conditional update, so two quick clicks can't both record a confirmation.
    result = await session.execute(
        update(Interview)
        .where(Interview.id == interview.id, Interview.confirmed_at.is_(None))
        .values(confirmed_at=now, updated_at=now)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount:  # type: ignore[attr-defined]
        record_activity(
            session,
            interview.application_id,
            ActivityType.INTERVIEW_CONFIRMED,
            "Confirmed interview",
            description=interview.title,
            metadata={
                "interview_id": interview.id,
                "interview_title": interview.title,
                "confirmed_by": candidate.full_name,
                "via": "candidate_portal",
            },
            at=now,
        )
    await session.commit()
    await session.refresh(interview)
    return present_interview(interview, now)


async def _own_interview(session: AsyncSession, candidate: Candidate, interview_id: uuid.UUID) -> Interview:
    """The interview if it belongs to one of the candidate's applications. Anyone else's is a 404."""
    interview = await session.scalar(
        select(Interview)
        .join(Application, Interview.application_id == Application.id)
        .where(Interview.id == interview_id, Application.candidate_id == candidate.id)
    )
    if interview is None:
        raise NotFoundError("Interview not found.")
    return interview
