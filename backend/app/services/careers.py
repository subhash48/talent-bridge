"""TalentBridge's own careers site: open jobs, and applying with a name, an email and a résumé (and
what the job asks: which of its work days they can work, and their relevant experience).

An application is created the moment it's sent: the recruiter sees it at once, with the résumé, and
the applicant gets a secure email link into their candidate portal (an invitation for a new account,
a sign-in link for an existing one). Nobody creates an account or a password to apply. Applying again
to the same job adds nothing, and just sends a fresh link.
"""

import logging
import re
import uuid
from collections.abc import Awaitable, Callable
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import (
    ActivityType,
    ApplicationStage,
    EmailStatus,
    JobStatus,
    PortalAccountStatus,
    UserRole,
    Weekday,
)
from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.rate_limit import RateLimiter
from app.integrations.email import DisabledEmail, EmailProvider
from app.integrations.supabase_admin import SupabaseAdmin, SupabaseAdminError
from app.models import Application, Candidate, CandidateStageHistory, Job, User
from app.models.base import utcnow
from app.schemas.careers import ApplicationCreate, ApplicationResult, CareerJobDetail, CareerJobSummary
from app.services import account_provisioning, application_emails, resumes
from app.services.activity_service import record_activity
from app.services.ai.context import parse_requirements
from app.services.demo_resumes import read_upload

logger = logging.getLogger(__name__)

P = PortalAccountStatus
SOURCE = "Careers site"
NOT_OPEN = "This role isn't open for applications."
NOT_EMAILED = "The email service didn't accept it."
PortalLink = Literal["invitation_sent", "sign_in_link_sent", "unavailable"]


# One address applying this often in ten minutes is a script, not a person: it waits (429).
APPLY_LIMIT, APPLY_WINDOW_SECONDS = 10, 600
limiter = RateLimiter(
    APPLY_LIMIT,
    APPLY_WINDOW_SECONDS,
    "You've sent several applications just now. Please wait a few minutes and try again.",
    code="too_many_applications",
)
# Applying again sends a sign-in link each time, so anyone could fill someone's inbox by applying with their
# email: one inbox gets at most this many in an hour from applying (the application itself still counts).
LINKS_PER_INBOX, LINK_WINDOW_SECONDS = 3, 3600
links = RateLimiter(LINKS_PER_INBOX, LINK_WINDOW_SECONDS, "Too many sign-in links for one inbox.")


class EmailNotAccepted(AppError):
    status_code = 422
    code = "email_not_accepted"


class AvailabilityRequired(AppError):
    status_code = 422
    code = "availability_required"


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
        pay=job.pay,
        shift=job.shift,
        work_days=job.work_days or [],
        openings=job.openings,
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
    session: AsyncSession,
    job_id: uuid.UUID,
    data: ApplicationCreate,
    admin: SupabaseAdmin | None,
    mailer: EmailProvider | None = None,
) -> ApplicationResult:
    mailer = mailer or DisabledEmail()
    job = _native_open(await session.get(Job, job_id))
    if job.status == JobStatus.CLOSED:
        raise ConflictError(NOT_OPEN, code="job_closed")
    email = data.email
    staff = await session.scalar(select(User).where(User.email == email, User.role != UserRole.CANDIDATE))
    if staff is not None:
        raise EmailNotAccepted("Apply with a personal email address, not a staff account.")
    resume = read_upload(data.resume)  # 422 invalid_resume says what to fix
    _check_availability(job, data.availability)
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
    application: Application | None = None
    if existing is None:
        now = utcnow()
        application = Application(
            candidate_id=candidate.id,
            job_id=job.id,
            stage=ApplicationStage.SOURCED,
            source=SOURCE,
            applied_at=now,
            phone=data.phone,
            linkedin_url=data.linkedin_url,
            availability=[day.value for day in data.availability],
            experience_note=data.experience_note,
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

    applied = existing or application
    assert applied is not None
    portal_link = await _portal_link(session, candidate, applied, job, admin, mailer)
    status = "already_applied" if existing is not None else "submitted"
    logger.info("careers.applied job=%s candidate=%s status=%s portal=%s", job.id, candidate.id, status, portal_link)
    return ApplicationResult(
        status=status,
        portal_link=portal_link,
        email=email,
        job_title=job.title,
        company=job.company.name,
        confirmation_emailed=mailer.configured and portal_link != "unavailable",
    )


def _check_availability(job: Job, days: list[Weekday]) -> None:
    """A job that lists its work days asks which of them the applicant can work: at least one, and only
    those."""
    offered = set(job.work_days or [])
    if not offered:
        return
    if not days:
        raise AvailabilityRequired("Choose the days you can work.")
    if any(day.value not in offered for day in days):
        raise AvailabilityRequired("Choose from the days this job needs.")


async def _portal_link(
    session: AsyncSession,
    candidate: Candidate,
    application: Application,
    job: Job,
    admin: SupabaseAdmin | None,
    email: EmailProvider,
) -> PortalLink:
    """Email the applicant a way into their portal: a new account's invitation (to create their password),
    or an existing account's sign-in link. With an email provider configured, TalentBridge sends one email
    of its own that confirms the application and carries the link; otherwise Supabase sends its invitation
    or sign-in email. Failing to email never undoes the application."""
    if admin is None:
        return "unavailable"
    if candidate.portal_status in (P.NOT_REQUIRED, P.INVITE_FAILED):
        await account_provisioning.request_invitation(session, candidate)
    invited_before = candidate.portal_invited_at
    company = job.company.name

    def confirmation(new_account: bool) -> Callable[[str], Awaitable[str | None]]:
        async def send(link: str) -> str | None:
            message = application_emails.application_received(
                to=candidate.email,
                first_name=candidate.first_name,
                job_title=job.title,
                company=company,
                link=link,
                new_account=new_account,
                application_id=str(application.id),
            )
            result = await email.send(message)
            return None if result.status == EmailStatus.SENT else result.error or NOT_EMAILED

        return send

    ours = email.configured
    status = await account_provisioning.provision_portal_account(
        session, candidate.id, admin, send_invitation=confirmation(True) if ours else None
    )
    await session.refresh(candidate)
    if status == P.INVITED and candidate.portal_invited_at and candidate.portal_invited_at != invited_before:
        return "invitation_sent"
    if status in (P.INVITED, P.ACTIVE):
        if not links.allow(candidate.email):
            logger.info("careers.sign_in_link_held candidate=%s reason=too_many_for_inbox", candidate.id)
            return "unavailable"
        redirect = settings.portal_sign_in_redirect_url
        try:
            if ours:
                failed = await confirmation(False)(await admin.sign_in_link_url(candidate.email, redirect_to=redirect))
                if failed:
                    logger.warning("careers.confirmation_failed candidate=%s error=%s", candidate.id, failed)
                    return "unavailable"
            else:
                await admin.send_sign_in_link(candidate.email, redirect_to=redirect)
        except SupabaseAdminError as exc:
            logger.warning("careers.sign_in_link_failed candidate=%s error=%s", candidate.id, exc)
            return "unavailable"
        return "sign_in_link_sent"
    return "unavailable"


async def _lock_email(session: AsyncSession, email: str) -> None:
    """One application per email at a time on Postgres; SQLite writes one transaction at a time anyway."""
    if session.get_bind().dialect.name == "postgresql":
        await session.execute(text("select pg_advisory_xact_lock(hashtext(:email))"), {"email": email})
