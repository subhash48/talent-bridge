"""Pipeline rows: an application with its person, job, latest activity, engagement and next
interview. Shared by the candidate, application and dashboard services."""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.models import Application, CandidateActivity, CandidateEngagementEvent, Interview, Message, PortalSession
from app.models.base import utcnow
from app.schemas.activity import ActivityBrief
from app.schemas.application import origin_of
from app.schemas.candidate import CandidateListItem, CandidateRead
from app.schemas.interview import InterviewBrief
from app.schemas.job import JobBrief
from app.services.engagement.scoring import MEANINGFUL_VIEWS
from app.services.engagement.service import engagement_read
from app.services.engagement.snapshot import ApplicationSnapshot

Row = TypeVar("Row", CandidateActivity, Message, Interview, PortalSession, CandidateEngagementEvent)


async def get_application(session: AsyncSession, application_id: uuid.UUID, *, for_update: bool = False) -> Application:
    """The application with its candidate and job, or a 404."""
    query = (
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.candidate), selectinload(Application.job))
    )
    if for_update:
        query = query.with_for_update(of=Application)  # serialises concurrent stage changes
    application = await session.scalar(query)
    if application is None:
        raise NotFoundError("Application not found.")
    return application


async def load_snapshots(
    session: AsyncSession, applications: Sequence[Application], *, with_engagement: bool = False
) -> list[ApplicationSnapshot]:
    """Three queries for any number of applications (five with engagement), instead of that many
    per application."""
    ids = [application.id for application in applications]
    if not ids:
        return []

    activities = await _grouped(
        session,
        select(CandidateActivity)
        .where(CandidateActivity.application_id.in_(ids))
        .order_by(CandidateActivity.created_at.desc(), CandidateActivity.id),
    )
    messages = await _grouped(
        session,
        select(Message).where(Message.application_id.in_(ids)).order_by(Message.created_at, Message.id),
    )
    interviews = await _grouped(
        session,
        select(Interview).where(Interview.application_id.in_(ids)).order_by(Interview.scheduled_at, Interview.id),
    )
    sessions: dict[uuid.UUID, list] = defaultdict(list)
    views: dict[uuid.UUID, list] = defaultdict(list)
    if with_engagement:
        sessions = await _grouped(
            session,
            select(PortalSession).where(PortalSession.application_id.in_(ids)).order_by(PortalSession.started_at),
        )
        views = await _grouped(
            session,
            select(CandidateEngagementEvent)
            .where(
                CandidateEngagementEvent.application_id.in_(ids),
                CandidateEngagementEvent.event_type.in_([event.value for event in MEANINGFUL_VIEWS]),
            )
            .order_by(CandidateEngagementEvent.occurred_at),
        )
    return [
        ApplicationSnapshot(
            application=application,
            activities=activities[application.id],
            messages=messages[application.id],
            interviews=interviews[application.id],
            sessions=sessions[application.id],
            engagement_events=views[application.id],
        )
        for application in applications
    ]


async def _grouped(session: AsyncSession, query) -> dict[uuid.UUID, list]:  # type: ignore[no-untyped-def]
    groups: dict[uuid.UUID, list] = defaultdict(list)
    for row in await session.scalars(query):
        groups[row.application_id].append(row)
    return groups


def to_list_item(snapshot: ApplicationSnapshot, now: datetime) -> CandidateListItem:
    application = snapshot.application
    upcoming = snapshot.upcoming_interview(now)
    return CandidateListItem(
        application_id=application.id,
        candidate=CandidateRead.model_validate(application.candidate),
        job=JobBrief.model_validate(application.job),
        stage=application.stage,
        source=application.source,
        origin=origin_of(application.external_id),
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        archived_at=application.archived_at,
        last_activity=ActivityBrief.model_validate(snapshot.activities[0]) if snapshot.activities else None,
        engagement=engagement_read(snapshot, application.candidate, now),
        next_interview=InterviewBrief.model_validate(upcoming) if upcoming else None,
    )


async def build_list_items(
    session: AsyncSession, applications: Sequence[Application], now: datetime | None = None
) -> list[CandidateListItem]:
    """Applications must have their candidate and job loaded."""
    now = now or utcnow()
    snapshots = await load_snapshots(session, applications, with_engagement=True)
    return [to_list_item(snapshot, now) for snapshot in snapshots]
