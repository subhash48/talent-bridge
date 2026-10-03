"""The candidate portal: the signed-in candidate's application, as they may see it.

It reads the same tables as the recruiter workspace, so a stage change, interview or message made
on either side shows on the other straight away. Every response is built by candidate_visibility.

The portal follows one application: the candidate's most recently updated active one.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import STAFF_ROLES, ActivityType, ApplicationStage, SenderType, UserRole
from app.core.errors import NotFoundError
from app.models import Application, Candidate, CandidateStageHistory, User
from app.models.base import utcnow
from app.schemas.portal import (
    CandidateApplicationDetail,
    CandidateMe,
    PortalActivity,
    PortalApplication,
    PortalCandidate,
    PortalInterview,
    PortalJob,
    PortalMessage,
    PortalRecruiter,
    ProfileUpdate,
)
from app.services.activity_service import record_activity
from app.services.ai.context import people
from app.services.candidate_visibility import (
    STAGE_LABELS,
    application_status,
    build_steps,
    is_unread_for_candidate,
    present_activity,
    present_candidate,
    present_interview,
    present_job,
    present_message,
)
from app.services.pipeline_service import load_snapshots

S = ApplicationStage
RECENT_ACTIVITY = 8
PROFILE_FIELDS = {"phone": "phone number", "location": "location", "headline": "headline", "skills": "skills"}


@dataclass(frozen=True)
class PortalRecord:
    """One application as the candidate may see it. Every portal response is built from this."""

    candidate: Candidate
    company: str
    application: PortalApplication
    job: PortalJob
    recruiter: PortalRecruiter | None
    interviews: list[PortalInterview]  # by scheduled time
    messages: list[PortalMessage]  # oldest first
    unread: int  # messages from the hiring team the candidate hasn't read
    activity: list[PortalActivity]  # newest first
    now: datetime

    @property
    def next_interview(self) -> PortalInterview | None:
        return next((interview for interview in self.interviews if interview.upcoming), None)


async def current_application(session: AsyncSession, candidate_id: uuid.UUID) -> Application | None:
    """The application the portal follows: the most recently updated one, active before archived."""
    applications = await session.scalars(
        select(Application).where(Application.candidate_id == candidate_id).options(selectinload(Application.job))
    )
    ordered = sorted(applications, key=lambda item: (item.archived_at is not None, -item.updated_at.timestamp()))
    return ordered[0] if ordered else None


async def require_application(session: AsyncSession, candidate_id: uuid.UUID) -> Application:
    application = await current_application(session, candidate_id)
    if application is None:
        raise NotFoundError("You don't have an application with us yet.", code="no_application")
    return application


async def load_record(
    session: AsyncSession, candidate: Candidate, *, now: datetime | None = None
) -> PortalRecord | None:
    now = now or utcnow()
    application = await current_application(session, candidate.id)
    if application is None:
        return None

    [snapshot] = await load_snapshots(session, [application])
    history = (
        await session.scalars(
            select(CandidateStageHistory).where(CandidateStageHistory.application_id == application.id)
        )
    ).all()
    recruiter = await recruiter_for(session, application.id)
    company = settings.organization_name

    interviews = [present_interview(interview, now) for interview in snapshot.interviews]
    titles = {str(interview.id): interview.title for interview in snapshot.interviews}
    messages = [
        presented
        for message in snapshot.messages
        if (
            presented := present_message(
                message,
                candidate_name=candidate.full_name,
                recruiter_name=recruiter.name if recruiter else None,
                company=company,
            )
        )
        is not None
    ]
    activity = [entry for row in snapshot.activities if (entry := present_activity(row, titles)) is not None]
    unread = sum(1 for message in snapshot.messages if is_unread_for_candidate(message))
    next_interview = next((interview for interview in interviews if interview.upcoming), None)

    return PortalRecord(
        candidate=candidate,
        company=company,
        application=PortalApplication(
            id=application.id,
            stage=application.stage,
            stage_label=STAGE_LABELS[application.stage],
            status=application_status(application.stage),
            applied_at=application.applied_at,
            updated_at=application.updated_at,
            steps=build_steps(application, history),
            next_step=next_step(application.stage, next_interview, unread, recruiter, company),
        ),
        job=present_job(application.job, company),
        recruiter=recruiter,
        interviews=interviews,
        messages=messages,
        unread=unread,
        activity=activity,
        now=now,
    )


async def require_record(session: AsyncSession, candidate: Candidate) -> PortalRecord:
    record = await load_record(session, candidate)
    if record is None:
        raise NotFoundError("You don't have an application with us yet.", code="no_application")
    return record


async def recruiter_for(session: AsyncSession, application_id: uuid.UUID) -> PortalRecruiter | None:
    """The recruiter who last moved the application, else the workspace's first recruiter."""
    user = await session.scalar(
        select(User)
        .join(CandidateStageHistory, CandidateStageHistory.changed_by == User.id)
        .where(CandidateStageHistory.application_id == application_id)
        .order_by(CandidateStageHistory.changed_at.desc())
        .limit(1)
    )
    user = user or await session.scalar(
        select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.created_at).limit(1)
    )
    if user is None:
        return None
    return PortalRecruiter(
        name=user.full_name,
        email=user.email,
        title="Recruiter" if user.role == UserRole.RECRUITER else "Talent team",
    )


def next_step(
    stage: ApplicationStage,
    interview: PortalInterview | None,
    unread: int,
    recruiter: PortalRecruiter | None,
    company: str,
) -> str:
    """One sentence on what happens next, in the candidate's words."""
    who = recruiter.name.split()[0] if recruiter else "Your recruiter"
    if stage == S.REJECTED:
        return f"This application is closed. Thank you for the time you spent with {company}."
    if stage == S.HIRED:
        return f"Welcome to {company}! {who} will be in touch about your first day."
    if interview and interview.can_confirm:
        return f"Confirm your {interview.title} so the team knows you're set."
    if interview:
        return f"Prepare for your {interview.title}. Your interview prep is ready."
    if unread:
        return f"Read {who}'s latest message."
    return {
        S.SOURCED: f"The team is reviewing your profile. {who} will be in touch about next steps.",
        S.SCREENING: f"The team is reviewing your application. {who} will be in touch about next steps.",
        S.INTERVIEW: f"The team is gathering feedback from your interviews. {who} will update you on next steps.",
        S.OFFER: f"Review your offer, and message {who} with any questions.",
    }[stage]


# Reads


async def get_me(session: AsyncSession, candidate: Candidate) -> CandidateMe:
    record = await load_record(session, candidate)
    if record is None:
        return CandidateMe(company=settings.organization_name, candidate=present_candidate(candidate))
    latest = next(
        (message for message in reversed(record.messages) if message.sender_type != SenderType.CANDIDATE), None
    )
    return CandidateMe(
        company=record.company,
        candidate=present_candidate(candidate),
        application=record.application,
        job=record.job,
        recruiter=record.recruiter,
        next_interview=record.next_interview,
        unread_messages=record.unread,
        latest_message=latest,
        recent_activity=record.activity[:RECENT_ACTIVITY],
    )


async def get_application(session: AsyncSession, candidate: Candidate) -> CandidateApplicationDetail:
    record = await require_record(session, candidate)
    return CandidateApplicationDetail(
        application=record.application,
        job=record.job,
        recruiter=record.recruiter,
        timeline=list(reversed(record.activity)),
    )


async def list_activity(session: AsyncSession, candidate: Candidate, *, limit: int = 50) -> list[PortalActivity]:
    """Newest first."""
    record = await load_record(session, candidate)
    return record.activity[:limit] if record else []


# Profile


async def update_profile(session: AsyncSession, candidate: Candidate, data: ProfileUpdate) -> PortalCandidate:
    """Changes the candidate's own contact details. The recruiter sees them on the same record."""
    sent = data.model_dump(exclude_unset=True)
    if sent.get("skills", []) is None:
        del sent["skills"]  # null skills means "no change", not "remove them all"
    changes = {field: value for field, value in sent.items() if getattr(candidate, field) != value}
    if not changes:
        return present_candidate(candidate)

    now = utcnow()
    for field, value in changes.items():
        setattr(candidate, field, value)
    candidate.updated_at = now
    application = await current_application(session, candidate.id)
    if application is not None:
        labels = [PROFILE_FIELDS[field] for field in PROFILE_FIELDS if field in changes]
        record_activity(
            session,
            application.id,
            ActivityType.PROFILE_UPDATED,
            f"Updated {people(labels)}",
            metadata={"fields": sorted(changes), "via": "candidate_portal"},
            at=now,
        )
    await session.commit()
    return present_candidate(candidate)
