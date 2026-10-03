"""Interviews: scheduling, the recruiter's schedule and status updates.

Scheduling, confirming, completing and cancelling each record a timeline entry.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.core.enums import ActivityType, ApplicationStage, InterviewStatus
from app.core.errors import BadRequestError, NotFoundError
from app.models import Application, Candidate, Interview, Job, User
from app.models.base import utcnow
from app.schemas.common import CandidateRef
from app.schemas.interview import InterviewCreate, InterviewListItem, InterviewRead, InterviewUpdate
from app.services.activity_service import record_activity
from app.services.pipeline_service import get_application


async def list_interviews(
    session: AsyncSession,
    *,
    status: InterviewStatus | None = None,
    upcoming: bool | None = None,
    limit: int = 200,
) -> list[InterviewListItem]:
    """The schedule across the active pipeline, soonest first."""
    now = utcnow()
    query = (
        select(Interview, Application)
        .join(Application, Interview.application_id == Application.id)
        .join(Application.candidate)
        .join(Application.job)
        .options(contains_eager(Application.candidate), contains_eager(Application.job))
        .where(Application.archived_at.is_(None))
        .order_by(Interview.scheduled_at, Interview.id)
        .limit(limit)
    )
    if status is not None:
        query = query.where(Interview.status == status)
    if upcoming is True:
        query = query.where(Interview.scheduled_at > now)
    elif upcoming is False:
        query = query.where(Interview.scheduled_at <= now)

    rows = await session.execute(query)
    return [
        InterviewListItem(
            **InterviewRead.model_validate(interview).model_dump(),
            candidate=_ref(application),
        )
        for interview, application in rows.all()
    ]


def _ref(application: Application) -> CandidateRef:
    candidate: Candidate = application.candidate
    job: Job = application.job
    return CandidateRef(
        application_id=application.id,
        candidate_id=candidate.id,
        full_name=candidate.full_name,
        avatar_url=candidate.avatar_url,
        job_title=job.title,
    )


async def list_for_application(session: AsyncSession, application_id: uuid.UUID) -> list[InterviewRead]:
    await get_application(session, application_id)
    rows = await session.scalars(
        select(Interview)
        .where(Interview.application_id == application_id)
        .order_by(Interview.scheduled_at, Interview.id)
    )
    return [InterviewRead.model_validate(row) for row in rows]


async def schedule_interview(
    session: AsyncSession, application_id: uuid.UUID, data: InterviewCreate, actor: User | None
) -> InterviewRead:
    application = await get_application(session, application_id)
    name = application.candidate.first_name
    if application.archived_at is not None:
        raise BadRequestError(
            f"Restore {name} to the pipeline before scheduling an interview.", code="application_archived"
        )
    if application.stage in (ApplicationStage.HIRED, ApplicationStage.REJECTED):
        raise BadRequestError(
            f"Interviews can't be scheduled for {application.stage.label.lower()} candidates.",
            code="application_closed",
        )
    now = utcnow()
    if data.scheduled_at <= now:
        raise BadRequestError("Pick a time in the future for the interview.", code="interview_in_past")

    interview = Interview(application_id=application.id, **data.model_dump(), created_at=now, updated_at=now)
    session.add(interview)
    await session.flush()
    record_activity(
        session,
        application.id,
        ActivityType.INTERVIEW_SCHEDULED,
        f"{interview.title} scheduled",
        metadata={
            "interview_id": interview.id,
            "scheduled_at": interview.scheduled_at,
            "interview_type": interview.interview_type,
            "interviewers": interview.interviewers,
            "scheduled_by": actor.full_name if actor else None,
        },
        at=now,
    )
    await session.commit()
    return InterviewRead.model_validate(interview)


async def update_interview(
    session: AsyncSession, interview_id: uuid.UUID, data: InterviewUpdate, actor: User | None
) -> InterviewRead:
    interview = await session.get(Interview, interview_id)
    if interview is None:
        raise NotFoundError("Interview not found.")

    now = utcnow()
    changes = data.model_dump(exclude_unset=True)
    confirmed = changes.pop("confirmed", None)
    previous_status = interview.status
    for field, value in changes.items():
        setattr(interview, field, value)
    interview.updated_at = now

    by = actor.full_name if actor else None
    if confirmed and interview.confirmed_at is None:
        interview.confirmed_at = now
        record_activity(
            session,
            interview.application_id,
            ActivityType.INTERVIEW_CONFIRMED,
            "Confirmed interview",
            metadata={"interview_id": interview.id, "recorded_by": by},
            at=now,
        )
    elif confirmed is False:
        interview.confirmed_at = None
    if interview.status != previous_status:
        if interview.status == InterviewStatus.COMPLETED:
            activity, title = ActivityType.INTERVIEW_COMPLETED, f"{interview.title} completed"
        elif interview.status == InterviewStatus.CANCELLED:
            activity, title = ActivityType.INTERVIEW_CANCELLED, f"{interview.title} cancelled"
        else:
            activity, title = ActivityType.INTERVIEW_SCHEDULED, f"{interview.title} rescheduled"
        record_activity(
            session,
            interview.application_id,
            activity,
            title,
            metadata={"interview_id": interview.id, "updated_by": by},
            at=now,
        )
    await session.commit()
    return InterviewRead.model_validate(interview)
