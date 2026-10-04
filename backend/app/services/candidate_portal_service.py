"""The candidate portal: the signed-in candidate's applications, as they may see them.

It reads the same tables as the recruiter workspace, so a stage change, interview or message made
on either side (or synced from Ashby) shows on the other straight away. Every response is built by
candidate_visibility.

A candidate can have several applications. Each portal request works on one of them: the one the
request names, which must be the candidate's own (anyone else's is a 404, the same as one that
doesn't exist), or by default the most recently updated active one.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import STAFF_ROLES, ActivityType, ApplicationBucket, ApplicationStage, SenderType, UserRole
from app.core.errors import NotFoundError
from app.models import Application, Candidate, CandidateStageHistory, User
from app.models.base import utcnow
from app.schemas.portal import (
    CandidateApplicationDetail,
    CandidateMe,
    PortalActivity,
    PortalApplication,
    PortalApplicationSummary,
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
    BUCKET_ORDER,
    NO_LONGER_CONSIDERED,
    PortalStatus,
    build_steps,
    is_unread_for_candidate,
    portal_status,
    present_activity,
    present_candidate,
    present_interview,
    present_job,
    present_message,
)
from app.services.engagement.snapshot import ApplicationSnapshot
from app.services.pipeline_service import load_snapshots

S = ApplicationStage
B = ApplicationBucket
RECENT_ACTIVITY = 8
PROFILE_FIELDS = {"phone": "phone number", "location": "location", "headline": "headline", "skills": "skills"}
NO_APPLICATION = "You don't have an application with us yet."


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


# Which application


async def candidate_applications(session: AsyncSession, candidate_id: uuid.UUID) -> list[Application]:
    """All of the candidate's applications, in the order the portal lists them: active first, then
    no longer under consideration, then inactive; most recently updated first within each."""
    applications = await session.scalars(
        select(Application).where(Application.candidate_id == candidate_id).options(selectinload(Application.job))
    )
    return sorted(applications, key=lambda item: (BUCKET_ORDER.index(status_of(item).bucket), -item.updated_at.timestamp()))


def status_of(application: Application) -> PortalStatus:
    return portal_status(application, application.job.status)


async def owned_application(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None
) -> Application:
    """The application the request names, if it's the candidate's own, else their default one.

    Never trusts the id on its own: it must belong to the signed-in candidate, or it's a 404.
    """
    if application_id is None:
        applications = await candidate_applications(session, candidate.id)
        if not applications:
            raise NotFoundError(NO_APPLICATION, code="no_application")
        return applications[0]
    application = await session.scalar(
        select(Application)
        .where(Application.id == application_id, Application.candidate_id == candidate.id)
        .options(selectinload(Application.job))
    )
    if application is None:
        raise NotFoundError("Application not found.", code="application_not_found")
    return application


async def current_application(session: AsyncSession, candidate_id: uuid.UUID) -> Application | None:
    """The application the portal opens on, or None when there is none."""
    applications = await candidate_applications(session, candidate_id)
    return applications[0] if applications else None


# Records


async def load_record(
    session: AsyncSession, candidate: Candidate, application: Application, *, now: datetime | None = None
) -> PortalRecord:
    now = now or utcnow()
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
    status = status_of(application)

    return PortalRecord(
        candidate=candidate,
        company=company,
        application=PortalApplication(
            id=application.id,
            stage=application.stage,
            stage_label=status.label,
            status=status.bucket,
            applied_at=application.applied_at,
            updated_at=application.updated_at,
            steps=build_steps(application, history, status.bucket),
            next_step=next_step(application.stage, status, next_interview, unread, recruiter, company),
        ),
        job=present_job(application.job, company),
        recruiter=recruiter,
        interviews=interviews,
        messages=messages,
        unread=unread,
        activity=activity,
        now=now,
    )


async def require_record(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None
) -> PortalRecord:
    return await load_record(session, candidate, await owned_application(session, candidate, application_id))


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
    status: PortalStatus,
    interview: PortalInterview | None,
    unread: int,
    recruiter: PortalRecruiter | None,
    company: str,
) -> str:
    """One sentence on what happens next, in the candidate's words."""
    who = recruiter.name.split()[0] if recruiter else "Your recruiter"
    if status.bucket == B.NO_LONGER_CONSIDERED:
        return f"This application is {NO_LONGER_CONSIDERED.lower()}. Thank you for the time you spent with {company}."
    if stage == S.HIRED:
        return f"Welcome to {company}! {who} will be in touch about your first day."
    if status.bucket == B.INACTIVE:
        if status.label == "Role closed":
            return f"This role has closed. Thank you for your interest in {company}."
        return "This application is no longer active."
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


async def list_applications(session: AsyncSession, candidate: Candidate) -> list[PortalApplicationSummary]:
    applications = await candidate_applications(session, candidate.id)
    snapshots = await load_snapshots(session, applications)
    return [summarize(snapshot, settings.organization_name, utcnow()) for snapshot in snapshots]


def summarize(snapshot: ApplicationSnapshot, company: str, now: datetime) -> PortalApplicationSummary:
    application = snapshot.application
    status = status_of(application)
    upcoming = next(
        (interview for interview in snapshot.interviews if present_interview(interview, now).upcoming), None
    )
    return PortalApplicationSummary(
        id=application.id,
        job_title=application.job.title,
        company=company,
        department=application.job.department,
        location=application.job.location,
        stage=application.stage,
        stage_label=status.label,
        status=status.bucket,
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        next_interview_at=upcoming.scheduled_at if upcoming and status.bucket == B.ACTIVE else None,
        unread_messages=sum(1 for message in snapshot.messages if is_unread_for_candidate(message)),
        withdrawn=status.withdrawn,
    )


async def get_me(session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None) -> CandidateMe:
    """The portal home. An application id that isn't the candidate's shows their default one instead
    (nothing about the other application is revealed either way)."""
    applications = await candidate_applications(session, candidate.id)
    company = settings.organization_name
    if not applications:
        return CandidateMe(company=company, candidate=present_candidate(candidate))
    now = utcnow()
    snapshots = await load_snapshots(session, applications)
    focus = next((item for item in applications if item.id == application_id), applications[0])
    record = await load_record(session, candidate, focus, now=now)
    latest = next(
        (message for message in reversed(record.messages) if message.sender_type != SenderType.CANDIDATE), None
    )
    return CandidateMe(
        company=company,
        candidate=present_candidate(candidate),
        applications=[summarize(snapshot, company, now) for snapshot in snapshots],
        application=record.application,
        job=record.job,
        recruiter=record.recruiter,
        next_interview=record.next_interview,
        unread_messages=record.unread,
        latest_message=latest,
        recent_activity=record.activity[:RECENT_ACTIVITY],
    )


async def get_application(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None
) -> CandidateApplicationDetail:
    record = await require_record(session, candidate, application_id)
    return CandidateApplicationDetail(
        application=record.application,
        job=record.job,
        recruiter=record.recruiter,
        timeline=list(reversed(record.activity)),
    )


async def list_activity(
    session: AsyncSession, candidate: Candidate, *, application_id: uuid.UUID | None = None, limit: int = 50
) -> list[PortalActivity]:
    """Newest first."""
    if application_id is None and await current_application(session, candidate.id) is None:
        return []
    record = await require_record(session, candidate, application_id)
    return record.activity[:limit]


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
