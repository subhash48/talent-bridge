"""TalentBridge's own careers site: open jobs, and applying with a name, an email and a résumé.

An application is created the moment it's sent: the recruiter sees it at once, with the résumé, and
the applicant gets a secure email link into their candidate portal (an invitation for a new account,
a sign-in link for an existing one). Nobody creates an account or a password to apply. Applying again
to the same job adds nothing, and just sends a fresh link.
"""

import logging
import re
import uuid
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType, ApplicationStage, JobStatus, PortalAccountStatus, UserRole
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.supabase_admin import SupabaseAdmin, SupabaseAdminError
from app.models import Application, Candidate, CandidateStageHistory, Job, User
from app.models.base import utcnow
from app.schemas.careers import ApplicationCreate, ApplicationResult, CareerJobDetail, CareerJobSummary
from app.services import account_provisioning, resumes
from app.services.activity_service import record_activity
from app.services.ai.context import parse_requirements
from app.services.demo_resumes import read_upload

logger = logging.getLogger(__name__)

P = PortalAccountStatus
SOURCE = "Careers site"
NOT_OPEN = "This role isn't open for applications."
PortalLink = Literal["invitation_sent", "sign_in_link_sent", "unavailable"]


class EmailNotAccepted(AppError):
    status_code = 422
    code = "email_not_accepted"


def _native_open(job: Job | None) -> Job:
    """Only jobs made in TalentBridge are on its careers site; Ashby's live in Ashby."""
    if job is None or job.external_id is not None or job.status == JobStatus.DRAFT:
        raise NotFoundError("This role isn't on the careers site.", code="job_not_found")
    return job


def _paragraphs(description: str | None) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", description or "") if part.strip()]


def _summary(job: Job) -> CareerJobSummary:
    paragraphs = _paragraphs(job.description)
    return CareerJobSummary(
        id=job.id,
        title=job.title,
        company=job.company.name,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        summary=paragraphs[0] if paragraphs else None,
        published_at=job.created_at,
    )


def _detail(job: Job) -> CareerJobDetail:
    paragraphs = [p for p in _paragraphs(job.description) if not re.match(r"(?i)^requirements\s*:", p)]
    return CareerJobDetail(
        **_summary(job).model_dump(),
        about_role="\n\n".join(paragraphs[1:]) or None,
        requirements=list(parse_requirements(job.description)),
    )


async def list_jobs(session: AsyncSession) -> list[CareerJobSummary]:
    """Open jobs made in TalentBridge, newest first."""
    jobs = await session.scalars(
        select(Job).where(Job.external_id.is_(None), Job.status == JobStatus.OPEN).order_by(Job.created_at.desc())
    )
    return [_summary(job) for job in jobs]


async def get_job(session: AsyncSession, job_id: uuid.UUID) -> CareerJobDetail:
    job = _native_open(await session.get(Job, job_id))
    if job.status != JobStatus.OPEN:
        raise NotFoundError("This role isn't on the careers site.", code="job_not_found")
    return _detail(job)


async def apply(
    session: AsyncSession, job_id: uuid.UUID, data: ApplicationCreate, admin: SupabaseAdmin | None
) -> ApplicationResult:
    job = _native_open(await session.get(Job, job_id))
    if job.status == JobStatus.CLOSED:
        raise ConflictError(NOT_OPEN, code="job_closed")
    email = data.email
    staff = await session.scalar(select(User).where(User.email == email, User.role != UserRole.CANDIDATE))
    if staff is not None:
        raise EmailNotAccepted("Apply with a personal email address, not a staff account.")
    resume = read_upload(data.resume)  # 422 invalid_resume says what to fix
    await _lock_email(session, email)

    candidate = await session.scalar(select(Candidate).where(Candidate.email == email))
    if candidate is None:
        candidate = Candidate(
            first_name=data.first_name,
            last_name=data.last_name,
            email=email,
            phone=data.phone,
            portal_status=P.PENDING_INVITATION,
        )
        session.add(candidate)
        await session.flush()
    elif data.phone and not candidate.phone:
        candidate.phone = data.phone

    existing = await session.scalar(
        select(Application).where(Application.candidate_id == candidate.id, Application.job_id == job.id).limit(1)
    )
    if existing is None:
        now = utcnow()
        application = Application(
            candidate_id=candidate.id, job_id=job.id, stage=ApplicationStage.SOURCED, source=SOURCE, applied_at=now
        )
        session.add(application)
        await session.flush()
        session.add(
            CandidateStageHistory(
                application_id=application.id, previous_stage=None, new_stage=ApplicationStage.SOURCED, changed_at=now
            )
        )
        record_activity(
            session,
            application.id,
            ActivityType.APPLICATION_CREATED,
            "Applied on the careers site",
            metadata={"source": SOURCE},
            at=now,
        )
        await resumes.store(session, candidate, application, resume)
    await session.commit()

    portal_link = await _portal_link(session, candidate, admin)
    status = "already_applied" if existing is not None else "submitted"
    logger.info("careers.applied job=%s candidate=%s status=%s portal=%s", job.id, candidate.id, status, portal_link)
    return ApplicationResult(status=status, portal_link=portal_link, email=email, job_title=job.title)


async def _portal_link(session: AsyncSession, candidate: Candidate, admin: SupabaseAdmin | None) -> PortalLink:
    """Email the applicant a way into their portal: a new account's invitation, or an existing
    account's sign-in link. Failing to email never undoes the application."""
    if admin is None:
        return "unavailable"
    if candidate.portal_status in (P.NOT_REQUIRED, P.INVITE_FAILED):
        await account_provisioning.request_invitation(session, candidate)
    invited_before = candidate.portal_invited_at
    status = await account_provisioning.provision_portal_account(session, candidate.id, admin)
    await session.refresh(candidate)
    if status == P.INVITED and candidate.portal_invited_at and candidate.portal_invited_at != invited_before:
        return "invitation_sent"
    if status in (P.INVITED, P.ACTIVE):
        try:
            await admin.send_sign_in_link(candidate.email, redirect_to=settings.portal_sign_in_redirect_url)
        except SupabaseAdminError as exc:
            logger.warning("careers.sign_in_link_failed candidate=%s error=%s", candidate.id, exc)
            return "unavailable"
        return "sign_in_link_sent"
    return "unavailable"


async def _lock_email(session: AsyncSession, email: str) -> None:
    """One application per email at a time on Postgres; SQLite writes one transaction at a time anyway."""
    if session.get_bind().dialect.name == "postgresql":
        await session.execute(text("select pg_advisory_xact_lock(hashtext(:email))"), {"email": email})
