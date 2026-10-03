"""Candidates and the recruiter pipeline.

The pipeline lists applications rather than people: a person applying to two jobs appears twice,
once per job, each with its own stage and history.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, selectinload

from app.core.enums import ActivityType, ApplicationStage, JobStatus
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.models import (
    AIAnalysis,
    Application,
    Candidate,
    CandidateActivity,
    CandidateStageHistory,
    Job,
    User,
)
from app.models.base import utcnow
from app.schemas.activity import ActivityRead
from app.schemas.ai import AIAnalysisRead
from app.schemas.application import ApplicationBrief, ApplicationRead, StageHistoryRead
from app.schemas.candidate import CandidateCreate, CandidateDetail, CandidateListItem, CandidateRead
from app.schemas.common import Page
from app.schemas.interview import InterviewRead
from app.schemas.job import JobRead
from app.schemas.message import MessageRead
from app.services.activity_service import record_activity
from app.services.application_service import check_initial_stage, record_stage
from app.services.pipeline_service import build_list_items, engagement_for, load_snapshots

DETAIL_ACTIVITY_LIMIT = 100


async def list_pipeline(
    session: AsyncSession,
    *,
    stage: ApplicationStage | None = None,
    job_id: uuid.UUID | None = None,
    search: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> Page[CandidateListItem]:
    """Most recent activity first."""
    query = (
        select(Application)
        .join(Application.candidate)
        .join(Application.job)
        .options(contains_eager(Application.candidate), contains_eager(Application.job))
    )
    if not include_archived:
        query = query.where(Application.archived_at.is_(None))
    if stage is not None:
        query = query.where(Application.stage == stage)
    if job_id is not None:
        query = query.where(Application.job_id == job_id)
    for term in (search or "").split():
        pattern = f"%{_escape_like(term)}%"
        query = query.where(
            or_(
                Candidate.first_name.ilike(pattern, escape="\\"),
                Candidate.last_name.ilike(pattern, escape="\\"),
                Candidate.email.ilike(pattern, escape="\\"),
                Candidate.location.ilike(pattern, escape="\\"),
                Candidate.headline.ilike(pattern, escape="\\"),
                cast(Candidate.skills, String).ilike(pattern, escape="\\"),
                Job.title.ilike(pattern, escape="\\"),
            )
        )

    total = await session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    last_activity_at = (
        select(func.max(CandidateActivity.created_at))
        .where(CandidateActivity.application_id == Application.id)
        .correlate(Application)
        .scalar_subquery()
    )
    applications = (
        await session.scalars(
            query.order_by(func.coalesce(last_activity_at, Application.applied_at).desc(), Application.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = await build_list_items(session, applications)
    return Page[CandidateListItem](items=items, total=total or 0, limit=limit, offset=offset)


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def get_candidate_detail(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID | None = None,
    *,
    now: datetime | None = None,
) -> CandidateDetail:
    """The candidate and one of their applications: the one asked for, else the most recent."""
    now = now or utcnow()
    candidate = await session.scalar(
        select(Candidate)
        .where(Candidate.id == candidate_id)
        .options(selectinload(Candidate.applications).selectinload(Application.job))
        .execution_options(populate_existing=True)
    )
    if candidate is None:
        raise NotFoundError("Candidate not found.")

    applications = sorted(
        candidate.applications,
        key=lambda item: (item.archived_at is not None, -item.updated_at.timestamp()),
    )
    briefs = [
        ApplicationBrief(
            id=item.id,
            job_id=item.job_id,
            job_title=item.job.title,
            stage=item.stage,
            archived=item.archived_at is not None,
        )
        for item in applications
    ]
    if application_id is not None:
        focus = next((item for item in applications if item.id == application_id), None)
        if focus is None:
            raise NotFoundError("This application doesn't belong to the candidate.")
    else:
        focus = applications[0] if applications else None

    candidate_read = CandidateRead.model_validate(candidate)
    if focus is None:
        return CandidateDetail(candidate=candidate_read, applications=briefs)

    [snapshot] = await load_snapshots(session, [focus])
    history = await session.scalars(
        select(CandidateStageHistory)
        .where(CandidateStageHistory.application_id == focus.id)
        .order_by(CandidateStageHistory.changed_at.desc(), CandidateStageHistory.id)
    )
    analysis = await session.scalar(
        select(AIAnalysis).where(AIAnalysis.application_id == focus.id).order_by(AIAnalysis.created_at.desc()).limit(1)
    )
    upcoming = snapshot.upcoming_interview(now)
    return CandidateDetail(
        candidate=candidate_read,
        application=ApplicationRead.model_validate(focus),
        job=JobRead.model_validate(focus.job),
        stage=focus.stage,
        engagement=engagement_for(snapshot, now),
        next_interview=InterviewRead.model_validate(upcoming) if upcoming else None,
        activity=[ActivityRead.model_validate(row) for row in snapshot.activities[:DETAIL_ACTIVITY_LIMIT]],
        interviews=[InterviewRead.model_validate(row) for row in snapshot.interviews],
        messages=[MessageRead.model_validate(row) for row in snapshot.messages],
        stage_history=[StageHistoryRead.model_validate(row) for row in history],
        applications=briefs,
        ai_analysis=AIAnalysisRead.model_validate(analysis) if analysis else None,
    )


async def create_candidate(session: AsyncSession, data: CandidateCreate, actor: User | None) -> CandidateDetail:
    """Create the person and, with a job_id, their application, its first stage and timeline entry."""
    if await session.scalar(select(Candidate.id).where(Candidate.email == data.email)):
        raise ConflictError("A candidate with this email is already in your pipeline.", code="candidate_exists")

    job: Job | None = None
    if data.job_id is not None:
        job = await session.get(Job, data.job_id)
        if job is None:
            raise NotFoundError("The selected job doesn't exist.")
        if job.status == JobStatus.CLOSED:
            raise BadRequestError(f"{job.title} is closed to new candidates.", code="job_closed")
        check_initial_stage(data.stage)

    now = utcnow()
    candidate = Candidate(
        **data.model_dump(exclude={"job_id", "stage", "source"}),
        created_at=now,
        updated_at=now,
    )
    session.add(candidate)
    await session.flush()

    application: Application | None = None
    if job is not None:
        application = Application(
            candidate_id=candidate.id,
            job_id=job.id,
            stage=data.stage,
            source=data.source or "Added by recruiter",
            applied_at=now,
            updated_at=now,
        )
        session.add(application)
        await session.flush()
        record_stage(session, application, None, actor, now)
        record_activity(
            session,
            application.id,
            ActivityType.APPLICATION_CREATED,
            "Added to pipeline",
            metadata={
                "job": job.title,
                "stage": data.stage,
                "source": application.source,
                "added_by": actor.full_name if actor else None,
            },
            at=now,
        )
    await session.commit()
    return await get_candidate_detail(session, candidate.id, application.id if application else None)
