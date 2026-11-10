"""The Hirvello job board (/jobs): every employer's open public jobs, searching them, and applying, signed in
to the candidate portal or with a name, an email and a résumé (and what the job asks: which of its work days
they can work, and their relevant experience).

One rule decides what's on the board (public_job_criteria), for the list, the search, a job's page and both
ways of applying. An application is created the moment it's sent, on the job's employer (application -> job
-> company), so it's in that employer's workspace at once with the résumé. Someone applying without an
account gets a secure email link into their candidate portal (an invitation for a new account, a sign-in
link for an existing one); nobody creates an account or a password to apply. A signed-in candidate's
application is in their portal straight away, and nothing is emailed. Applying again to the same job adds
nothing.
"""

import logging
import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import BigInteger, ColumnElement, and_, case, cast, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import (
    ActivityType,
    ApplicationStage,
    EmailStatus,
    JobSource,
    JobStatus,
    JobVisibility,
    PortalAccountStatus,
    SalaryPeriod,
    UserRole,
    Weekday,
)
from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.rate_limit import RateLimiter
from app.integrations.email import DisabledEmail, EmailProvider
from app.integrations.supabase_admin import SupabaseAdmin, SupabaseAdminError
from app.models import Application, Candidate, CandidateStageHistory, Company, Job, User
from app.models.base import utcnow
from app.schemas.careers import (
    ApplicationCreate,
    ApplicationResult,
    CandidateApplicationCreate,
    CandidateApplyResult,
    CareerJobDetail,
    CareerJobSummary,
    JobBoardCounts,
    JobBoardPage,
    JobBoardQuery,
)
from app.services import account_provisioning, application_emails, resumes
from app.services.activity_service import record_activity
from app.services.ai.context import parse_requirements
from app.services.demo_resumes import Resume, read_upload

logger = logging.getLogger(__name__)

P = PortalAccountStatus
SOURCE = "Careers site"
APPLIED = "Applied on the careers site"  # without an account
APPLIED_SIGNED_IN = "Applied on the Hirvello job board"
NOT_LISTED = "This role isn't on the careers site."
NOT_OPEN = "This role isn't open for applications."
NOT_EMAILED = "The email service didn't accept it."
PortalLink = Literal["invitation_sent", "sign_in_link_sent", "unavailable"]
MAX_SEARCH_WORDS = 8


# One address applying this often in ten minutes is a script, not a person: it waits (429).
APPLY_LIMIT, APPLY_WINDOW_SECONDS = 10, 600
limiter = RateLimiter(
    APPLY_LIMIT,
    APPLY_WINDOW_SECONDS,
    "You've sent several applications just now. Please wait a few minutes and try again.",
    code="too_many_applications",
)
# The same for a signed-in candidate, counted per candidate rather than per address.
candidate_limiter = RateLimiter(
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


# What's on the board


def public_job_criteria(now: datetime) -> list[ColumnElement[bool]]:
    """The one rule for what the job board shows and takes applications for: a job made in Hirvello (Ashby's
    live in Ashby, demo jobs on the demo site), open, public, and not past its closing date. Drafts, closed,
    private and expired jobs never appear; deleted ones don't exist."""
    return [
        Job.external_id.is_(None),
        Job.status == JobStatus.OPEN,
        Job.visibility == JobVisibility.PUBLIC,
        or_(Job.expires_at.is_(None), Job.expires_at > now),
    ]


def _posted() -> ColumnElement[datetime]:
    """When it went on the board: the first time it opened, or when it was made for a job from before that was
    recorded."""
    return func.coalesce(Job.published_at, Job.created_at)


def _newest_first() -> tuple[ColumnElement[object], ...]:
    return (_posted().desc(), Job.id)


async def _public_job(session: AsyncSession, job_id: uuid.UUID) -> Job | None:
    return await session.scalar(select(Job).where(Job.id == job_id, *public_job_criteria(utcnow())))


async def _job_taking_applications(session: AsyncSession, job_id: uuid.UUID) -> Job:
    """The job, if it's on the board. A job that was on it and isn't taking applications anymore (closed, or
    past its closing date) is 409 job_closed; anything never on it (a draft, private, another system's) is 404
    job_not_found, as if it didn't exist."""
    job = await _public_job(session, job_id)
    if job is not None:
        return job
    job = await session.get(Job, job_id)
    if job is None or job.external_id is not None or job.status == JobStatus.DRAFT:
        raise NotFoundError(NOT_LISTED, code="job_not_found")
    if job.visibility == JobVisibility.PRIVATE:
        raise NotFoundError(NOT_LISTED, code="job_not_found")
    raise ConflictError(NOT_OPEN, code="job_closed")


def _paragraphs(description: str | None) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", description or "") if part.strip()]


def _summary(job: Job) -> CareerJobSummary:
    paragraphs = _paragraphs(job.description)
    salary_given = job.salary_min is not None or job.salary_max is not None
    return CareerJobSummary(
        id=job.id,
        title=job.title,
        company=job.company.name,
        source=job.posted_by,
        company_logo_url=job.company.logo_url,
        department=job.department,
        location=job.location,
        work_arrangement=job.work_arrangement.label if job.work_arrangement else None,
        employment_type=job.employment_type,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_currency=job.salary_currency if salary_given else None,
        salary_period=job.salary_period if salary_given else None,
        summary=paragraphs[0] if paragraphs else None,
        published_at=job.published_at or job.created_at,
        expires_at=job.expires_at,
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
    """Every job on the board, newest first."""
    jobs = await session.scalars(select(Job).where(*public_job_criteria(utcnow())).order_by(*_newest_first()))
    return [_summary(job) for job in jobs]


async def get_job(session: AsyncSession, job_id: uuid.UUID) -> CareerJobDetail:
    job = await _public_job(session, job_id)
    if job is None:
        raise NotFoundError(NOT_LISTED, code="job_not_found")
    return _detail(job)


async def search(session: AsyncSession, query: JobBoardQuery) -> JobBoardPage:
    """One page of the board's jobs that match every filter, newest first. The tabs' counts apply every filter
    but who posted it, so each tab says how many jobs it shows."""
    now = utcnow()
    filters = [*public_job_criteria(now), *_filters(query, now)]
    rows = await session.execute(select(Job.posted_by, func.count()).where(*filters).group_by(Job.posted_by))
    per_source: dict[JobSource, int] = {JobSource(source): count for source, count in rows.all()}
    counts = JobBoardCounts(
        all=sum(per_source.values()),
        recruiter=per_source.get(JobSource.RECRUITER, 0),
        small_business=per_source.get(JobSource.SMALL_BUSINESS, 0),
    )
    if query.source is not None:
        filters.append(Job.posted_by == query.source)
    jobs = await session.scalars(
        select(Job).where(*filters).order_by(*_newest_first()).limit(query.limit).offset(query.offset)
    )
    return JobBoardPage(
        items=[_summary(job) for job in jobs],
        total=per_source.get(query.source, 0) if query.source is not None else counts.all,
        counts=counts,
        limit=query.limit,
        offset=query.offset,
    )


def _filters(query: JobBoardQuery, now: datetime) -> list[ColumnElement[bool]]:
    """The search's filters, as SQL both SQLite and Postgres run."""
    filters: list[ColumnElement[bool]] = []
    # Every word somewhere in the job or its employer's name: "designer london" finds a London designer role.
    for word in (query.q or "").split()[:MAX_SEARCH_WORDS]:
        pattern = _contains(word)
        filters.append(
            or_(
                Job.title.ilike(pattern, escape="\\"),
                Job.department.ilike(pattern, escape="\\"),
                Job.description.ilike(pattern, escape="\\"),
                Job.location.ilike(pattern, escape="\\"),
                Job.company.has(Company.name.ilike(pattern, escape="\\")),
            )
        )
    if query.location:
        filters.append(Job.location.ilike(_contains(query.location), escape="\\"))
    if query.arrangement:
        filters.append(Job.work_arrangement.in_(query.arrangement))
    if query.type:
        # The employment type is the employer's own words: "Full-time", "full time" and "Full_Time" are one type.
        normalised = func.lower(Job.employment_type)
        for character in (" ", "-", "_"):
            normalised = func.replace(normalised, character, "")
        filters.append(normalised.in_([kind.replace("_", "") for kind in query.type]))
    if query.salary == "listed":
        filters.append(or_(Job.salary_min.is_not(None), Job.salary_max.is_not(None), Job.pay.is_not(None)))
    elif query.salary is not None:
        # The top of the range a year (bigint: an hourly rate times 2080 can pass what an integer holds). A job
        # that gives its pay only in words isn't compared.
        amount = cast(func.coalesce(Job.salary_max, Job.salary_min), BigInteger)
        per_year = case(
            *((Job.salary_period == period, period.per_year) for period in SalaryPeriod if period.per_year != 1),
            else_=1,
        )
        # The board labels these thresholds in US dollars. Other currencies need an exchange rate before
        # they could be compared honestly; they remain visible under "Salary listed".
        filters.append(and_(amount.is_not(None), Job.salary_currency == "USD", amount * per_year >= int(query.salary)))
    if query.posted_within is not None:
        filters.append(_posted() >= now - timedelta(days=query.posted_within))
    return filters  # not who posted it: search applies that after counting the tabs


def _contains(text: str) -> str:
    """A LIKE pattern for text anywhere, with the text's own % and _ matched literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# Applying


async def apply(
    session: AsyncSession,
    job_id: uuid.UUID,
    data: ApplicationCreate,
    admin: SupabaseAdmin | None,
    mailer: EmailProvider | None = None,
) -> ApplicationResult:
    """Without an account: the applicant is who the email says, and their portal link goes to that email."""
    mailer = mailer or DisabledEmail()
    job = await _job_taking_applications(session, job_id)
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

    existing = await _application_of(session, candidate, job)
    applied = existing or await _create_application(session, candidate, job, data, resume, APPLIED)
    await session.commit()

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


async def apply_as_candidate(
    session: AsyncSession, job_id: uuid.UUID, candidate: Candidate, data: CandidateApplicationCreate
) -> CandidateApplyResult:
    """Signed in to the candidate portal: the application is theirs, under their account's name and email
    (never ones a request sends). It's in their portal at once, so nothing is emailed."""
    job = await _job_taking_applications(session, job_id)
    resume = read_upload(data.resume)  # 422 invalid_resume says what to fix
    _check_availability(job, data.availability)
    await _lock_email(session, candidate.email)

    if data.phone and not candidate.phone:
        candidate.phone = data.phone
    existing = await _application_of(session, candidate, job)
    applied = existing or await _create_application(session, candidate, job, data, resume, APPLIED_SIGNED_IN)
    await session.commit()

    status: Literal["submitted", "already_applied"] = "already_applied" if existing is not None else "submitted"
    logger.info("careers.applied_signed_in job=%s candidate=%s status=%s", job.id, candidate.id, status)
    return CandidateApplyResult(
        status=status, application_id=applied.id, job_title=job.title, company=job.company.name
    )


async def _application_of(session: AsyncSession, candidate: Candidate, job: Job) -> Application | None:
    return await session.scalar(
        select(Application).where(Application.candidate_id == candidate.id, Application.job_id == job.id).limit(1)
    )


async def _create_application(
    session: AsyncSession,
    candidate: Candidate,
    job: Job,
    data: ApplicationCreate | CandidateApplicationCreate,
    resume: Resume,
    title: str,
) -> Application:
    """A new application from the board, in the job's employer's workspace: just applied, with the answers it
    came with, its first stage in the history, the timeline's first entry and the résumé. Flushes."""
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
        session, application.id, ActivityType.APPLICATION_CREATED, title, metadata={"source": SOURCE}, at=now
    )
    await resumes.store(session, candidate, application, resume)
    return application


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
    or an existing account's sign-in link. With an email provider configured, Hirvello sends one email
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
