"""Pipeline rows: an application with its person, job, latest activity, communication health and next
interview. Shared by the candidate, application and dashboard services."""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import TypeVar

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.models import Application, CandidateActivity, CandidateResume, Interview, Message
from app.models.base import utcnow
from app.schemas.activity import ActivityBrief
from app.schemas.application import origin_of
from app.schemas.candidate import CandidateListItem, CandidateRead
from app.schemas.interview import InterviewBrief
from app.schemas.job import JobBrief
from app.services import resumes
from app.services.communication.health import assess
from app.services.communication.present import summary
from app.services.communication.rules import Rules, load_rules
from app.services.snapshot import ApplicationSnapshot

Row = TypeVar("Row", CandidateActivity, Message, Interview)


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


async def load_snapshots(session: AsyncSession, applications: Sequence[Application]) -> list[ApplicationSnapshot]:
    """Three queries for any number of applications, instead of that many per application."""
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
    sent_with, on_person = await _resumes(session, applications)
    return [
        ApplicationSnapshot(
            application=application,
            activities=activities[application.id],
            messages=messages[application.id],
            interviews=interviews[application.id],
            resume_id=sent_with.get(application.id) or on_person.get(application.candidate_id),
        )
        for application in applications
    ]


async def _resumes(
    session: AsyncSession, applications: Sequence[Application]
) -> tuple[dict[uuid.UUID, uuid.UUID], dict[uuid.UUID, uuid.UUID]]:
    """The newest résumé sent with each application, and the newest kept on each person without one."""
    rows = await session.execute(
        select(CandidateResume.id, CandidateResume.application_id, CandidateResume.candidate_id)
        .where(
            or_(
                CandidateResume.application_id.in_([application.id for application in applications]),
                and_(
                    CandidateResume.application_id.is_(None),
                    CandidateResume.candidate_id.in_({application.candidate_id for application in applications}),
                ),
            )
        )
        .order_by(CandidateResume.created_at, CandidateResume.id)
    )
    sent_with: dict[uuid.UUID, uuid.UUID] = {}
    on_person: dict[uuid.UUID, uuid.UUID] = {}
    for resume_id, application_id, candidate_id in rows:
        if application_id is not None:
            sent_with[application_id] = resume_id
        else:
            on_person[candidate_id] = resume_id
    return sent_with, on_person


def employer_view(snapshot: ApplicationSnapshot) -> CandidateRead:
    """The person as this application's employer sees them. One person record is shared by every employer
    they apply to, so the phone number and résumé are the ones they gave this employer, never another's."""
    candidate = snapshot.application.candidate
    if snapshot.resume_id is not None:
        resume_url: str | None = f"{resumes.URL_PREFIX}{snapshot.resume_id}"
    elif candidate.resume_url and not candidate.resume_url.startswith(resumes.URL_PREFIX):
        resume_url = candidate.resume_url  # a link typed in by hand, not a file someone sent
    else:
        resume_url = None
    return CandidateRead.model_validate(candidate).model_copy(
        update={"phone": snapshot.application.phone, "resume_url": resume_url}
    )


async def _grouped(session: AsyncSession, query) -> dict[uuid.UUID, list]:  # type: ignore[no-untyped-def]
    groups: dict[uuid.UUID, list] = defaultdict(list)
    for row in await session.scalars(query):
        groups[row.application_id].append(row)
    return groups


def to_list_item(snapshot: ApplicationSnapshot, now: datetime, rules: Rules) -> CandidateListItem:
    application = snapshot.application
    upcoming = snapshot.upcoming_interview(now)
    held = snapshot.last_interview(now)
    return CandidateListItem(
        application_id=application.id,
        candidate=employer_view(snapshot),
        job=JobBrief.model_validate(application.job),
        company_name=application.job.company.name,
        stage=application.stage,
        source=application.source,
        origin=origin_of(application.external_id),
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        archived_at=application.archived_at,
        candidate_messaging_enabled=application.candidate_messaging_enabled,
        phone=application.phone,
        availability=application.availability or [],
        experience_note=application.experience_note,
        last_activity=ActivityBrief.model_validate(snapshot.activities[0]) if snapshot.activities else None,
        communication=summary(assess(snapshot, rules, now), now),
        next_interview=InterviewBrief.model_validate(upcoming) if upcoming else None,
        last_interview_at=held.scheduled_at if held else None,
    )


async def build_list_items(
    session: AsyncSession, applications: Sequence[Application], now: datetime | None = None
) -> list[CandidateListItem]:
    """Applications must have their candidate and job loaded."""
    now = now or utcnow()
    snapshots = await load_snapshots(session, applications)
    rules = await load_rules(session)
    return [to_list_item(snapshot, now, rules) for snapshot in snapshots]
