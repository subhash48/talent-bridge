"""Development only: the public demo careers site, and the applications made there.

A published demo job (services/demo_jobs.py) is listed on /demo/careers, where anyone can apply with
their details and résumé. The application isn't sent to the hiring team straight away: whoever applies
must first prove they own the email, so nobody can apply in someone else's name.

1. apply() stores the application as pending (demo_applications, the résumé in demo_resumes) and gets
   the applicant a candidate portal sign-in: an invitation email to activate a new account (one
   covers every role they apply for while its link works), or, when the email already has an
   account, a sign-in with it.
2. Activating the account or signing in ends at GET /me, whose dependency runs submit_on_sign_in().
   The sign-in is proof when it is the account our invitation created at that email, the one Talent
   Bridge already links to that email, or one Supabase says confirmed the address. Each pending
   application made (or made again) in the last day is then delivered through the Ashby simulator
   (integrations/ashby/demo.py), so it reaches Talent Bridge as a real Ashby application does: the
   webhook processor, the importer, the stage mapping and the AI analysis all run. Then the sign-in is
   linked to the candidate.

Until then recruiters see nothing: no candidate or application exists before it is submitted. And what
was typed here never rewrites someone Talent Bridge already has: their name, phone and résumé link stay.

The simulator builds its payloads from backend/tests, which the production image doesn't ship, so it is
imported only when used (_simulator()). The API refuses every demo route in production anyway.
"""

import asyncio
import importlib
import logging
import time
import uuid
from collections.abc import Sequence
from datetime import timedelta
from types import ModuleType
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import DemoApplicationStatus, DemoPostingStatus, UserRole
from app.core.errors import AppError, ConflictError, NotFoundError, ServiceUnavailableError
from app.core.security import TokenClaims
from app.integrations.ashby.demo_ids import can_receive_mail, is_demo
from app.integrations.supabase_admin import AuthUserExists, SupabaseAdmin, SupabaseAdminError
from app.models import AIAnalysis, Application, Candidate, DemoApplication, DemoJobPosting, Job, User
from app.models.base import utcnow
from app.schemas.demo import (
    ApplyOutcome,
    CareerApplicationCreate,
    CareerApplicationResult,
    CareerJobDetail,
    CareerJobSummary,
)
from app.services import ai_service, demo_resumes
from app.services.account_provisioning import NOT_CONFIGURED
from app.services.account_service import AccountLinkError, find_auth_account, link_account
from app.services.ai.client import AIProvider

logger = logging.getLogger(__name__)

S = DemoApplicationStatus
PENDING = (S.AWAITING_ACTIVATION, S.AWAITING_SIGN_IN)

DEMO_CAREERS_SOURCE = "Ashby Simulator / Demo Careers"  # the application's source, as recruiters see it
# How long Supabase's email links work (its default). An invitation this recent also covers their next
# applications; after that they are sent a new one.
INVITE_LINK_LIFETIME = timedelta(hours=1)
PENDING_TTL = timedelta(hours=24)  # a pending application not made again for this long isn't submitted
SUBMIT_LEASE = timedelta(minutes=2)  # a submission in flight; a crashed one is retried after this
FRESH_LEASE = timedelta(seconds=30)  # an older lease is most likely a crashed request's: not worth waiting for
WAIT_SECONDS = 5.0  # how long GET /me waits for another request submitting the same applications
POLL_SECONDS = 0.1

NOT_ON_SITE = "This role isn't on the careers site."
NOT_TAKING_APPLICATIONS = "This role is no longer taking applications."
NO_MAILBOX = "Use an email address you can receive mail at: your activation link is sent there."
STAFF_EMAIL = "This email can't be used to apply. Use your personal email."
INVITE_FAILED = "We couldn't send the activation email just now."


class EmailNotAccepted(AppError):
    """Applications from this email can't be taken. The message says which email to use instead."""

    status_code = 422
    code = "email_not_accepted"


# The careers site


async def list_jobs(session: AsyncSession) -> list[CareerJobSummary]:
    """The published demo jobs, most recently published first."""
    postings = await session.scalars(
        select(DemoJobPosting)
        .where(DemoJobPosting.status == DemoPostingStatus.PUBLISHED)
        .order_by(DemoJobPosting.published_at.desc(), DemoJobPosting.created_at.desc())
    )
    return [CareerJobSummary.model_validate(_public(posting)) for posting in postings]


async def get_job(session: AsyncSession, job_id: uuid.UUID) -> CareerJobDetail:
    """A published demo job. Drafts, closed postings and every other job are 404."""
    posting = await session.get(DemoJobPosting, job_id)
    if posting is None or posting.status != DemoPostingStatus.PUBLISHED:
        raise NotFoundError(NOT_ON_SITE, code="job_not_found")
    return CareerJobDetail.model_validate(_public(posting))


async def apply(
    session: AsyncSession, job_id: uuid.UUID, data: CareerApplicationCreate, admin: SupabaseAdmin | None
) -> CareerApplicationResult:
    """Store the application as pending and get the applicant a sign-in to submit it with.

    One transaction; the invitation is sent once the application is flushed. Applying again before
    it is submitted updates the details and replaces the résumé, and sends no second invitation
    while the first one's link still works.
    """
    posting = await session.get(DemoJobPosting, job_id)
    if posting is None or posting.status == DemoPostingStatus.DRAFT:
        raise NotFoundError(NOT_ON_SITE, code="job_not_found")
    if posting.status == DemoPostingStatus.CLOSED:
        raise ConflictError(NOT_TAKING_APPLICATIONS, code="job_closed")
    _simulator()  # without it nothing could ever be submitted, so nothing is stored either

    email = data.email
    if not can_receive_mail(email):
        raise EmailNotAccepted(NO_MAILBOX)
    user = await session.scalar(select(User).where(User.email == email))
    if user is not None and user.role != UserRole.CANDIDATE:
        raise EmailNotAccepted(STAFF_EMAIL)
    resume = demo_resumes.read_upload(data.resume)
    await _lock_email(session, email)

    job = posting.job
    application = await session.scalar(
        select(DemoApplication).where(DemoApplication.email == email, DemoApplication.job_id == job.id)
    )
    submitted = application is not None and application.status == S.SUBMITTED
    if submitted or await _application_for(session, email, job.id) is not None:
        return CareerApplicationResult(status="already_applied", email=email, job_title=job.title)

    if application is None:
        application = DemoApplication(id=uuid.uuid4(), job_id=job.id, email=email)
        session.add(application)
    application.first_name, application.last_name = data.first_name, data.last_name
    application.phone, application.linkedin_url = data.phone, data.linkedin_url
    # Signing in submits only recent applications, and this makes it one again even when nothing else
    # changed (then no UPDATE would refresh updated_at by itself).
    application.updated_at = utcnow()
    await demo_resumes.save(session, application, resume)

    status = await _arrange_sign_in(session, application, user, admin)
    await session.commit()
    logger.info("demo_careers.applied demo_application=%s job=%s result=%s", application.id, job.id, status)
    return CareerApplicationResult(status=status, email=email, job_title=job.title)


# Submission on sign-in


async def submit_on_sign_in(
    factory: async_sessionmaker[AsyncSession],
    claims: TokenClaims,
    *,
    background: BackgroundTasks,
    provider: AIProvider,
) -> None:
    """Submit the pending applications this sign-in proves the applicant owns, before GET /me looks up
    who they are. Called only when the demo is enabled. Never raises: the person signs in whatever
    happens here, and anything not submitted is tried again on their next GET /me."""
    try:
        await _submit_pending(factory, claims, background, provider)
    except Exception:
        logger.exception("demo_careers.submit_crashed auth_user=%s", claims.subject)


async def _submit_pending(
    factory: async_sessionmaker[AsyncSession], claims: TokenClaims, background: BackgroundTasks, provider: AIProvider
) -> None:
    email = (claims.email or "").strip().lower()
    async with factory() as session:
        # Runs on every GET /me in development, so it is one indexed query when there's nothing to do.
        mine = DemoApplication.auth_user_id == claims.subject
        if email:
            mine = or_(mine, DemoApplication.email == email)
        rows = (
            await session.scalars(
                select(DemoApplication)
                .where(
                    DemoApplication.status.in_(PENDING),
                    # Left longer, it waits for them to apply again, so an application someone else made
                    # with their email isn't sent off by one of their routine sign-ins much later.
                    DemoApplication.updated_at > utcnow() - PENDING_TTL,
                    mine,
                )
                .order_by(DemoApplication.created_at)
            )
        ).all()
        if not rows:
            return
        user = await session.scalar(select(User).where(User.auth_user_id == claims.subject))
        eligible = await _eligible(session, rows, user, claims.subject, email)
        if not eligible:
            return
        try:
            simulator = _simulator()
        except ServiceUnavailableError:
            return  # they stay pending; _simulator() logged why
        claimed = await _claim(session, [row.id for row in eligible])
        job_ids = {row.job_id for row in eligible}
        jobs = {job.id: job for job in await session.scalars(select(Job).where(Job.id.in_(job_ids)))}

    submitted: list[tuple[DemoApplication, uuid.UUID, uuid.UUID]] = []  # each row, its application and candidate
    delivered: set[uuid.UUID] = set()  # the applications the simulator delivered
    for row in eligible:
        if row.id not in claimed:
            continue
        job = jobs[row.job_id]
        try:
            async with factory() as session:
                person = await session.scalar(select(Candidate).where(Candidate.email == row.email))
                existing = await _application_for(session, row.email, job.id)
            if existing is not None and not is_demo(existing.external_id):
                # Added to the job another way meanwhile, by a recruiter say: that application stands for
                # this one, where a delivery would have the importer adopt it and move it back to
                # screening. (One the simulator made is this row's, from a request that died before
                # recording it: delivering again just finds it.)
                submitted.append((row, existing.id, existing.candidate_id))
                continue
            result = await simulator.submit(
                factory,
                email=row.email,
                first_name=row.first_name,
                last_name=row.last_name,
                phone=row.phone,
                job_title=job.title,
                job_external_id=job.external_id,
                source=DEMO_CAREERS_SOURCE,
                profile=person is None,  # someone Talent Bridge has keeps their name and phone
            )
            if result.application_id is not None:
                await _restore_candidate(factory, row, result.candidate_id, person)
        except Exception:
            logger.exception("demo_careers.submit_failed demo_application=%s", row.id)
            await _release(factory, row.id)
            continue
        if result.application_id is None:
            logger.warning("demo_careers.not_submitted demo_application=%s ack=%s", row.id, result.outcome.lines)
            await _release(factory, row.id)
            continue
        submitted.append((row, result.application_id, result.candidate_id))
        delivered.add(result.application_id)

    if submitted:
        if user is None:
            await _link(factory, email, claims.subject)
        await _mark_submitted(factory, submitted)
        await _queue_analyses(factory, delivered, background, provider)
    # Applications another request is submitting: wait for it, so this request's user lookup sees the
    # sign-in it links.
    await _wait_for(factory, [row.id for row in eligible if row.id not in claimed])


async def _eligible(
    session: AsyncSession, rows: Sequence[DemoApplication], user: User | None, subject: uuid.UUID, email: str
) -> list[DemoApplication]:
    """The pending applications this sign-in proves the applicant owns."""
    if user is not None:
        # Staff never submit. A candidate submits what was made with their record's email, and only
        # with a token for that email: GET /me refuses any other.
        if user.role != UserRole.CANDIDATE or user.disabled_at is not None or (email and email != user.email):
            return []
        return [row for row in rows if row.email == user.email]
    # Not linked yet: the applications made with the token's email, for this account or for none we
    # know of, once the sign-in proves its owner has that inbox.
    mine = [row for row in rows if row.email == email and row.auth_user_id in (None, subject)]
    if not mine:
        return []
    # Never for a staff email (refused at apply too): linking would give this sign-in that staff users
    # row, which only an operator links (see account_service).
    role = await session.scalar(select(User.role).where(User.email == email))
    if role is not None and role != UserRole.CANDIDATE:
        return []
    # This is the account our invitation created: only the inbox's owner can accept it and sign in.
    if any(row.auth_user_id == subject and row.invited_at is not None for row in mine):
        return mine
    # Otherwise Supabase must say its owner confirmed the address (readable on Supabase Postgres
    # only). Holding a session isn't enough: some projects let anyone sign up as any address and sign
    # straight in, and an auto-confirmed address proves nothing (see account_service).
    account = await find_auth_account(session, auth_user_id=subject)
    if account is not None and account.email_verified and account.email == email:
        return mine
    return []


async def _claim(session: AsyncSession, ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Take the submission lease on every application not already being submitted, in one statement,
    so two sign-ins at once never split them between them. Returns the ids taken."""
    now = utcnow()
    taken = await session.scalars(
        update(DemoApplication)
        .where(
            DemoApplication.id.in_(ids),
            DemoApplication.status.in_(PENDING),
            or_(DemoApplication.finalizing_at.is_(None), DemoApplication.finalizing_at < now - SUBMIT_LEASE),
        )
        .values(finalizing_at=now)
        .returning(DemoApplication.id)
        .execution_options(synchronize_session=False)
    )
    claimed = set(taken.all())
    await session.commit()
    return claimed


async def _release(factory: async_sessionmaker[AsyncSession], demo_application_id: uuid.UUID) -> None:
    """Give the lease back: the application stays pending, for the next GET /me to try again."""
    async with factory() as session:
        await session.execute(
            update(DemoApplication).where(DemoApplication.id == demo_application_id).values(finalizing_at=None)
        )
        await session.commit()


async def _link(factory: async_sessionmaker[AsyncSession], email: str, subject: uuid.UUID) -> None:
    """Link the sign-in to the candidate the simulator made, or found, for this email. The portal
    invitation the import asked for is never sent: they are signed in already."""
    async with factory() as session:
        try:
            await link_account(session, email, subject)
        except AccountLinkError as exc:
            await session.rollback()
            logger.warning("demo_careers.not_linked auth_user=%s reason=%s", subject, exc)
        except IntegrityError:
            await session.rollback()  # another request linked it at the same moment


async def _restore_candidate(
    factory: async_sessionmaker[AsyncSession], row: DemoApplication, candidate_id: uuid.UUID, before: Candidate | None
) -> None:
    """Undo what the import did to the candidate that careers data mustn't. A new candidate gets the
    name exactly as typed (the import splits a full name at its first space: "Mary" "Ann Smith").
    Someone made in Talent Bridge gets no Ashby id: the import linked them by email to the simulator's,
    and `demo reset` deletes the simulator's candidates."""
    if before is None:
        values: dict[str, Any] = {"first_name": row.first_name, "last_name": row.last_name}
    elif before.external_id is None:
        values = {"external_id": None}
    else:
        return
    async with factory() as session:
        await session.execute(update(Candidate).where(Candidate.id == candidate_id).values(**values))
        await session.commit()


async def _mark_submitted(
    factory: async_sessionmaker[AsyncSession], submitted: list[tuple[DemoApplication, uuid.UUID, uuid.UUID]]
) -> None:
    """Record each submission, after the link: a request waiting for these sees both at once. The
    candidate's résumé is the one sent with their latest application, unless they have one from
    elsewhere: a recruiter's link is never replaced."""
    now = utcnow()
    async with factory() as session:
        for row, application_id, candidate_id in submitted:
            await session.execute(
                update(Candidate)
                .where(
                    Candidate.id == candidate_id,
                    or_(Candidate.resume_url.is_(None), Candidate.resume_url.startswith(demo_resumes.URL_PREFIX)),
                )
                .values(resume_url=f"{demo_resumes.URL_PREFIX}{row.id}")
            )
            await session.execute(
                update(DemoApplication)
                .where(DemoApplication.id == row.id)
                .values(status=S.SUBMITTED, submitted_at=now, application_id=application_id, finalizing_at=None)
            )
            logger.info("demo_careers.submitted demo_application=%s application=%s", row.id, application_id)
        await session.commit()


async def _queue_analyses(
    factory: async_sessionmaker[AsyncSession],
    application_ids: set[uuid.UUID],
    background: BackgroundTasks,
    provider: AIProvider,
) -> None:
    """The AI analysis of each application delivered that has none yet, once each. The import asks for
    one only when it creates the application, so a delivery repeated after a request died part-way
    through would otherwise never get one."""
    if not settings.ashby_auto_analyze or not application_ids:
        return
    async with factory() as session:
        analysed = set(
            (
                await session.scalars(
                    select(AIAnalysis.application_id).where(AIAnalysis.application_id.in_(application_ids))
                )
            ).all()
        )
    for application_id in sorted(application_ids - analysed):
        background.add_task(ai_service.analyze_in_background, factory, application_id, provider)


async def _wait_for(factory: async_sessionmaker[AsyncSession], ids: list[uuid.UUID]) -> None:
    """Wait, up to WAIT_SECONDS, while another request holds a fresh lease on these applications. One
    older than FRESH_LEASE is most likely a request that died: waiting for it would only hold up every
    sign-in until the lease runs out."""
    deadline = time.monotonic() + WAIT_SECONDS
    while ids and time.monotonic() < deadline:
        await asyncio.sleep(POLL_SECONDS)
        async with factory() as session:
            ids = list(
                (
                    await session.scalars(
                        select(DemoApplication.id).where(
                            DemoApplication.id.in_(ids),
                            DemoApplication.status.in_(PENDING),
                            DemoApplication.finalizing_at > utcnow() - FRESH_LEASE,
                        )
                    )
                ).all()
            )


# Internals


def _simulator() -> ModuleType:
    """The Ashby simulator, imported on first use: it needs backend/tests, which only a checkout has."""
    try:
        return importlib.import_module("app.integrations.ashby.demo")
    except ImportError as exc:
        logger.warning("demo_careers.simulator_unavailable error=%s", exc)
        raise ServiceUnavailableError(
            "The demo careers site needs the backend source checkout (backend/tests).", code="demo_unavailable"
        ) from None


def _public(posting: DemoJobPosting) -> dict[str, Any]:
    """A posting as the careers site shows it. The recruiter's notes for the AI are never included."""
    job = posting.job
    return {
        "id": job.id,
        "title": job.title,
        "department": job.department,
        "location": job.location,
        "work_arrangement": posting.work_arrangement,
        "employment_type": job.employment_type,
        "seniority": posting.seniority,
        "summary": posting.summary,
        "published_at": posting.published_at,
        "about_role": posting.about_role,
        "responsibilities": posting.responsibilities,
        "requirements": posting.requirements,
        "preferred_qualifications": posting.preferred_qualifications,
        "skills": posting.skills,
        "about_team": posting.about_team,
    }


async def _application_for(session: AsyncSession, email: str, job_id: uuid.UUID) -> Application | None:
    """Their application for this job, if they have one, however it was made: Ashby, a recruiter, or
    this site."""
    return await session.scalar(
        select(Application)
        .join(Candidate, Application.candidate_id == Candidate.id)
        .where(Candidate.email == email, Application.job_id == job_id)
        .limit(1)
    )


async def _lock_email(session: AsyncSession, email: str) -> None:
    """Take applications for this email one at a time, until this transaction ends: two at once could
    each find no invitation and send one. Postgres only; on SQLite one transaction writes at a time."""
    if session.get_bind().dialect.name == "postgresql":
        await session.execute(text("select pg_advisory_xact_lock(hashtext(:email))"), {"email": email})


async def _arrange_sign_in(
    session: AsyncSession, application: DemoApplication, user: User | None, admin: SupabaseAdmin | None
) -> ApplyOutcome:
    """How the applicant will prove they own the email, which is what submits the application: by
    signing in to the account they have, or by activating the one an invitation creates."""
    # They have a candidate portal sign-in already.
    if user is not None and user.auth_user_id is not None:
        _set_pending(application, S.AWAITING_SIGN_IN, user.auth_user_id)
        return "sign_in_required"

    # Supabase has an account for this email (visible on Supabase Postgres only). Confirmed: they sign
    # in to it. Not confirmed yet (invited, not accepted): accepting the invitation submits this too.
    account = await find_auth_account(session, email=application.email)
    if account is not None and account.email_verified:
        _set_pending(application, S.AWAITING_SIGN_IN, account.id)
        return "sign_in_required"

    # The invitation sent with this application or another of theirs covers it, while the link works:
    # one email for every role they apply for. It vouches for this one only if it went to the account
    # this one waits for: Supabase's for the email when it has one (normally that invitation's).
    invited = (
        await session.execute(
            select(DemoApplication.auth_user_id, DemoApplication.invited_at)
            .where(
                DemoApplication.email == application.email,
                DemoApplication.status.in_(PENDING),
                DemoApplication.auth_user_id.is_not(None),
                DemoApplication.invited_at > utcnow() - INVITE_LINK_LIFETIME,
            )
            .order_by(DemoApplication.invited_at.desc())
            .limit(1)
        )
    ).first()
    if invited is not None:
        _set_pending(application, S.AWAITING_ACTIVATION, account.id if account is not None else invited.auth_user_id)
        if application.auth_user_id == invited.auth_user_id:
            application.invited_at = invited.invited_at
        return "invitation_sent"

    # Invite them, as account provisioning does: the link leads to /auth/callback, then to /welcome to
    # choose a password, and /welcome calls GET /me. An account whose invitation expired before they
    # accepted it is sent a new one: Supabase invites an unconfirmed account again.
    if admin is None:
        _set_pending(application, S.AWAITING_ACTIVATION, application.auth_user_id, error=NOT_CONFIGURED)
        logger.warning("demo_careers.invite_not_configured demo_application=%s", application.id)
        return "invitation_failed"
    try:
        invited_user = await admin.invite(
            application.email,
            redirect_to=settings.portal_invite_redirect_url,
            data={"full_name": f"{application.first_name} {application.last_name}"},
        )
    except AuthUserExists:
        # An account we can't see from here. Signing in to it submits the application, once we can
        # tell its owner confirmed this address.
        _set_pending(application, S.AWAITING_SIGN_IN, None)
        return "sign_in_required"
    except SupabaseAdminError as exc:
        _set_pending(application, S.AWAITING_ACTIVATION, application.auth_user_id, error=INVITE_FAILED)
        logger.warning("demo_careers.invite_failed demo_application=%s error=%s", application.id, exc)
        return "invitation_failed"
    _set_pending(application, S.AWAITING_ACTIVATION, invited_user.id)
    application.invited_at = utcnow()
    return "invitation_sent"


def _set_pending(
    application: DemoApplication,
    status: DemoApplicationStatus,
    auth_user_id: uuid.UUID | None,
    *,
    error: str | None = None,
) -> None:
    """What the application now waits for, and the account that will submit it, when known. An
    invitation vouches only for the account it created: waiting for another forgets it (the invite
    paths then record theirs)."""
    if auth_user_id != application.auth_user_id:
        application.invited_at = None
    application.status, application.auth_user_id, application.invite_error = status, auth_user_id, error
