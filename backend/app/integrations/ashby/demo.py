"""Development only: simulate Ashby events, to see the Ashby -> Talent Bridge flow without an Ashby account.

    python -m app.integrations.ashby.demo apply --email testcandidate1@example.com --first-name Maya --last-name Patel --job "TEST - ML Engineer"
    python -m app.integrations.ashby.demo stage --email testcandidate1@example.com --stage interview
    python -m app.integrations.ashby.demo interview --email testcandidate1@example.com
    python -m app.integrations.ashby.demo stage --email testcandidate1@example.com --stage rejected
    python -m app.integrations.ashby.demo status
    python -m app.integrations.ashby.demo reset

Each command builds the webhook Ashby would send (demo_payloads.py, from the values given: nothing is
read from disk, so it runs wherever app/ does) and hands its body to the WebhookProcessor the webhook
endpoint uses, so the importer, the stage mapping and the event ledger all run as they do for a real
delivery. The body is
signed with a key made for that one delivery, so the signature check runs too; ASHBY_WEBHOOK_SECRET is
never read, and there is no HTTP endpoint. The follow-ups the endpoint runs after responding (the
portal invitation, the AI analysis) run here once the processor returns.

The development-only demo careers site (services/demo_careers.py) delivers its applications with
submit(), the part of apply that sends the webhooks, once the applicant has signed in.

Safety:
- It refuses to run when ENVIRONMENT=production.
- Every Ashby id it makes starts with tb-demo-. reset deletes only records carrying one: the demo
  jobs (with a recruiter's demo job posting), candidates and applications (with their activity,
  interviews, messages and analyses), the demo candidates' portal users rows and the demo webhook
  events, and every application made on the demo careers site. A demo candidate who also has an
  application from outside the simulator is kept, with that application. Supabase Auth is never touched.
- An email that belongs to a candidate or a sign-in that isn't simulator data is refused, so it
  never takes over a real person.
- No invitation email is sent without --send-invite, and never to a domain that can't receive mail
  (example.com and the like), where it would only bounce. Without it provisioning still runs: an
  existing sign-in or Supabase account for the address is reused, otherwise the invitation stays pending.

To open the candidate portal as the demo candidate, either apply with --send-invite to an address you
can receive and accept the invitation, or add the user in Supabase (Authentication > Users > Add user)
and link it with `python -m app.db.accounts link EMAIL`. reset removes that link (not the Supabase
account); after the next apply an accepted invitation links again by itself, a dashboard user needs
linking again.
"""

import argparse
import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import sys
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, exists, func, inspect, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import UserRole
from app.core.errors import AppError
from app.integrations.ashby.demo_ids import DEMO_PREFIX, can_receive_mail, demo_id, is_demo
from app.integrations.ashby.demo_payloads import application_event, job_event, schedule_event
from app.integrations.ashby.webhook import FollowUps, WebhookProcessor
from app.integrations.supabase_admin import SupabaseAdmin, get_supabase_admin
from app.models import (
    Application,
    AshbyWebhookEvent,
    Candidate,
    CandidateActivity,
    DemoApplication,
    Interview,
    Job,
    User,
)
from app.models.base import utcnow
from app.schemas.integration import WebhookAck
from app.services import account_provisioning, ai_service, demo_resumes
from app.services.ai.client import AIProvider, get_ai_provider
from app.services.candidate_visibility import portal_status, present_activity

logger = logging.getLogger(__name__)

__all__ = ["DEMO_PREFIX", "can_receive_mail", "demo_id", "is_demo"]  # re-exported from demo_ids

DEFAULT_JOB = "TEST - ML Engineer"
INTERVIEW_HOUR_UTC = 16
NO_EMAIL_NOTE = "Simulator: no invitation email was sent. Run apply again with --send-invite to send one."

# --stage NAME -> the Ashby webhook that puts an application there: action, the Ashby stage (a title in
# demo_payloads.STAGES), the application status and the archive reason type. mapping.py decides
# what each becomes in Talent Bridge, exactly as for a real delivery.
STAGE_EVENTS: dict[str, tuple[str, str, str, str | None]] = {
    "screening": ("candidateStageChange", "Application Review", "Active", None),
    "interview": ("candidateStageChange", "Technical Interview", "Active", None),
    "offer": ("candidateStageChange", "Offer", "Active", None),
    "hired": ("candidateHire", "Hired", "Hired", None),
    "rejected": ("candidateStageChange", "Archived", "Archived", "RejectedByOrg"),
    "withdrawn": ("candidateStageChange", "Archived", "Archived", "RejectedByCandidate"),
}


class DemoError(Exception):
    """Why the command didn't run. The message is for the person running it."""


@dataclass
class Outcome:
    """What a command did, line by line, and whose applications to show afterwards."""

    lines: list[str] = field(default_factory=list)
    email: str | None = None


@dataclass
class Submitted:
    """What submit() delivered, and the application it made or found. None of the follow-ups have run."""

    outcome: Outcome
    follow_ups: FollowUps
    application_id: uuid.UUID | None = None  # None if no application in Talent Bridge came of it
    candidate_id: uuid.UUID | None = None


def require_development() -> None:
    if settings.environment == "production":
        raise DemoError(
            "The Ashby simulator is for development only and ENVIRONMENT is production. Nothing was changed."
        )


# Commands


async def apply(
    factory: async_sessionmaker[AsyncSession],
    *,
    email: str,
    first_name: str = "",
    last_name: str = "",
    job_title: str = DEFAULT_JOB,
    admin: SupabaseAdmin | None = None,
    provider: AIProvider | None = None,
) -> Outcome:
    """The candidate applies in Ashby: jobCreate for the job, then applicationSubmit, then the follow-ups.

    The same email and job always give the same Ashby ids and webhook ids, so running it again is a
    redelivery: acknowledged as a duplicate, nothing created twice.
    """
    require_development()
    email = _email(email)
    job_title = _job_title(job_title)
    async with factory() as session:
        await _check_unclaimed(session, email)

    submitted = await submit(factory, email=email, first_name=first_name, last_name=last_name, job_title=job_title)
    outcome, follow_ups = submitted.outcome, submitted.follow_ups
    if submitted.candidate_id is not None:
        # A rerun is a duplicate delivery with no follow-ups; a pending invitation is retried, as the
        # reconciliation sync would.
        follow_ups.invite_candidate_ids.add(submitted.candidate_id)
    outcome.lines += await _follow_up(factory, follow_ups, admin, provider)
    return outcome


async def submit(
    factory: async_sessionmaker[AsyncSession],
    *,
    email: str,
    first_name: str,
    last_name: str,
    job_title: str,
    job_external_id: str | None = None,
    phone: str | None = None,
    source: str | None = None,
    profile: bool = True,
) -> Submitted:
    """Deliver the application as Ashby would: jobCreate for the job, then applicationSubmit.

    job_external_id is the Ashby id of a job that already exists, such as a recruiter's demo job: then
    no jobCreate is sent. phone is sent only when given, and source defaults to Ashby's "Applied".
    profile=False sends no name and no phone at all, so the importer leaves an existing candidate's as
    they are. The same email and job
    always give the same Ashby ids and webhook ids, so delivering again is a duplicate. Nothing else
    runs: no follow-ups, and no check of whose email it is. apply() adds both for the command line; the
    demo careers site submits only for someone signed in as that email, and refuses staff emails.
    """
    require_development()
    email = _email(email)
    job_title = _job_title(job_title)
    now = utcnow()
    job_id = job_external_id or demo_id("job", job_title)
    application_id = demo_id("application", email, job_external_id or job_title)
    name = " ".join(part.strip() for part in (first_name, last_name) if part.strip())
    payload = application_event(
        "applicationSubmit",
        webhook_action_id=demo_id("event", "applicationSubmit", application_id),
        application_id=application_id,
        candidate_id=demo_id("candidate", email),
        email=email,
        name=name if profile else "",
        phone=phone if profile else None,
        source=source,
        job_id=job_id,
        job_title=job_title,
        stage="Application Review",
        updated_at=now,
        created_at=now,
    )

    outcome = Outcome(email=email)
    if job_external_id is None:
        job = job_event(
            "jobCreate", webhook_action_id=demo_id("event", "jobCreate", job_id), job_id=job_id, title=job_title, at=now
        )
        ack, _ = await _deliver(factory, job)
        outcome.lines.append(_ack_line(ack))
    ack, follow_ups = await _deliver(factory, payload)
    outcome.lines.append(_ack_line(ack))
    async with factory() as session:
        row = (
            await session.execute(
                select(Application.id, Application.candidate_id).where(Application.external_id == application_id)
            )
        ).first()
    if row is None:
        return Submitted(outcome, follow_ups)
    return Submitted(outcome, follow_ups, application_id=row.id, candidate_id=row.candidate_id)


async def stage(
    factory: async_sessionmaker[AsyncSession], *, email: str, stage: str, job_title: str | None = None
) -> Outcome:
    """Ashby moves the application: the stage change (or hire) webhook a recruiter's move there fires."""
    require_development()
    stage = stage.strip().lower()
    if stage not in STAGE_EVENTS:
        raise DemoError(f"Unknown stage {stage!r}. Use one of: {', '.join(STAGE_EVENTS)}.")
    action, ashby_stage, status, reason_type = STAGE_EVENTS[stage]
    async with factory() as session:
        application, candidate, job = await _demo_application(session, _email(email), job_title)
    # Someone Talent Bridge had before they applied on the demo careers site has no Ashby id. The import
    # links them by email to the simulator's id, which is put back to none below.
    candidate_id = candidate.external_id or demo_id("candidate", candidate.email)
    payload = application_event(
        action,
        webhook_action_id=f"{DEMO_PREFIX}event-{uuid.uuid4()}",
        application_id=application.external_id or "",
        candidate_id=candidate_id,
        email=candidate.email,
        name="",  # no name and no phone: a stage change leaves the person's details as they are
        job_id=job.external_id or "",
        job_title=job.title,
        stage=ashby_stage,
        status=status,
        updated_at=utcnow(),
        created_at=application.applied_at,
        archive_reason_type=reason_type,
    )
    outcome = Outcome(email=candidate.email)
    ack, follow_ups = await _deliver(factory, payload)
    if candidate.external_id is None:
        async with factory() as session:
            await session.execute(update(Candidate).where(Candidate.id == candidate.id).values(external_id=None))
            await session.commit()
    outcome.lines.append(_ack_line(ack))
    outcome.lines += await _follow_up(factory, follow_ups, None, None)
    return outcome


async def interview(
    factory: async_sessionmaker[AsyncSession], *, email: str, job_title: str | None = None, in_days: int = 3
) -> Outcome:
    """Ashby schedules an interview: interviewScheduleCreate, or interviewScheduleUpdate once it exists.

    It is at 16:00 UTC, in_days from today, so running it again the same day changes nothing.
    """
    require_development()
    if in_days < 1:
        raise DemoError("The interview has to be at least a day away.")
    async with factory() as session:
        application, candidate, _ = await _demo_application(session, _email(email), job_title)
        application_id = application.external_id or ""
        event_id = demo_id("interview", application_id)
        scheduled = await session.scalar(select(Interview.id).where(Interview.external_id == event_id))
    start = (datetime.now(UTC) + timedelta(days=in_days)).replace(
        hour=INTERVIEW_HOUR_UTC, minute=0, second=0, microsecond=0
    )
    payload = schedule_event(
        "interviewScheduleUpdate" if scheduled else "interviewScheduleCreate",
        webhook_action_id=f"{DEMO_PREFIX}event-{uuid.uuid4()}",
        application_id=application_id,
        schedule_id=demo_id("schedule", application_id),
        event_id=event_id,
        start=start,
        updated_at=utcnow(),
    )
    ack, _ = await _deliver(factory, payload)
    return Outcome(lines=[_ack_line(ack)], email=candidate.email)


async def status(factory: async_sessionmaker[AsyncSession]) -> Outcome:
    require_development()
    async with factory() as session:
        emails = (
            await session.scalars(
                select(Candidate.email).where(Candidate.external_id.startswith(DEMO_PREFIX)).order_by(Candidate.email)
            )
        ).all()
        lines: list[str] = []
        for email in emails:
            lines += await describe(session, email)
    return Outcome(lines=lines or ["No simulator records."])


async def reset(factory: async_sessionmaker[AsyncSession]) -> Outcome:
    """Delete what the simulator and the demo careers site made, and nothing else."""
    require_development()
    async with factory() as session:
        demo_candidates = (
            await session.scalars(select(Candidate).where(Candidate.external_id.startswith(DEMO_PREFIX)))
        ).all()
        not_demo = or_(Application.external_id.is_(None), ~Application.external_id.startswith(DEMO_PREFIX))
        shared = set(
            (
                await session.scalars(
                    select(Application.candidate_id).where(
                        Application.candidate_id.in_([candidate.id for candidate in demo_candidates]), not_demo
                    )
                )
            ).all()
        )
        removable = [candidate for candidate in demo_candidates if candidate.id not in shared]
        user_ids = [candidate.user_id for candidate in removable if candidate.user_id]

        async def remove(statement: Any) -> int:
            result = await session.execute(statement.execution_options(synchronize_session=False))
            return result.rowcount or 0

        # Every application made on the demo careers site, pending or submitted; résumés go with them. Only
        # where migration 013 made its tables: the simulator itself needs no more than 011 and 012.
        careers = 0
        if await session.run_sync(lambda sync: inspect(sync.connection()).has_table("demo_applications")):
            # Anyone kept below would still link to a résumé about to go.
            await session.execute(
                update(Candidate)
                .where(Candidate.resume_url.startswith(demo_resumes.URL_PREFIX))
                .values(resume_url=None)
                .execution_options(synchronize_session=False)
            )
            careers = await remove(delete(DemoApplication))
        # Activity, stage history, interviews, messages, analyses and engagement go with their application.
        applications = await remove(delete(Application).where(Application.external_id.startswith(DEMO_PREFIX)))
        candidates = await remove(delete(Candidate).where(Candidate.id.in_([candidate.id for candidate in removable])))
        users = await remove(delete(User).where(User.id.in_(user_ids), User.role == UserRole.CANDIDATE))
        # A recruiter's demo job takes its careers posting with it.
        jobs = await remove(
            delete(Job).where(Job.external_id.startswith(DEMO_PREFIX), ~exists().where(Application.job_id == Job.id))
        )
        events = await remove(delete(AshbyWebhookEvent).where(AshbyWebhookEvent.event_key.startswith(DEMO_PREFIX)))
        await session.commit()

    lines = [
        (
            f"Deleted {applications} application(s), {candidates} candidate(s), {users} portal sign-in link(s), "
            f"{jobs} job(s), {careers} demo careers application(s) and {events} webhook event(s) made by the simulator."
        ),
        "Supabase Auth accounts were not touched.",
    ]
    lines += [
        f"Kept {candidate.email} and their applications from outside the simulator."
        for candidate in demo_candidates
        if candidate.id in shared
    ]
    return Outcome(lines=lines)


# Reporting


async def describe(session: AsyncSession, email: str) -> list[str]:
    """One demo candidate as the recruiter and the candidate each see them."""
    candidate = await session.scalar(select(Candidate).where(Candidate.email == email))
    if candidate is None:
        return []
    lines = [f"{candidate.full_name} <{candidate.email}>"]
    access = f"  Portal access: {candidate.portal_status}"
    if candidate.portal_invite_error:
        access += f" ({candidate.portal_invite_error})"
    lines.append(access + (", sign-in linked" if candidate.user_id else ""))
    rows = (
        await session.execute(
            select(Application, Job)
            .join(Job, Application.job_id == Job.id)
            .where(Application.candidate_id == candidate.id)
            .order_by(Application.applied_at)
        )
    ).all()
    for application, job in rows:
        portal = portal_status(application, job.status)
        origin = "Ashby" if application.external_id else "Talent Bridge"
        lines.append(
            f"  {job.title}: stage {application.stage} (Ashby: {application.external_stage_title}, {application.external_status}),"
            f" source {origin} / {application.source}"
        )
        lines.append(f"    Candidate portal shows: {portal.bucket} - {portal.label}")
        interviews = (
            await session.scalars(
                select(Interview).where(Interview.application_id == application.id).order_by(Interview.scheduled_at)
            )
        ).all()
        for item in interviews:
            lines.append(f"    Interview: {item.title}, {item.scheduled_at:%Y-%m-%d %H:%M} UTC, {item.status}")
        activity = (
            await session.scalars(
                select(CandidateActivity)
                .where(CandidateActivity.application_id == application.id)
                .order_by(CandidateActivity.created_at)
            )
        ).all()
        titles = {str(item.id): item.title for item in interviews}
        visible = [entry.title for row in activity if (entry := present_activity(row, titles))]
        lines.append(f"    Candidate-visible activity: {'; '.join(visible) or 'none'}")
    return lines


async def totals(session: AsyncSession) -> str:
    demo_application = Application.external_id.startswith(DEMO_PREFIX)
    jobs = await session.scalar(select(func.count()).select_from(Job).where(Job.external_id.startswith(DEMO_PREFIX)))
    candidates = await session.scalar(
        select(func.count()).select_from(Candidate).where(Candidate.external_id.startswith(DEMO_PREFIX))
    )
    applications = await session.scalar(select(func.count()).select_from(Application).where(demo_application))
    interviews = await session.scalar(
        select(func.count())
        .select_from(Interview)
        .join(Application, Interview.application_id == Application.id)
        .where(demo_application)
    )
    sign_ins = await session.scalar(
        select(func.count())
        .select_from(Candidate)
        .where(Candidate.external_id.startswith(DEMO_PREFIX), Candidate.user_id.is_not(None))
    )
    invited = await session.scalar(
        select(func.count())
        .select_from(Candidate)
        .where(Candidate.external_id.startswith(DEMO_PREFIX), Candidate.portal_invited_at.is_not(None))
    )
    events = await session.scalar(
        select(func.count()).select_from(AshbyWebhookEvent).where(AshbyWebhookEvent.event_key.startswith(DEMO_PREFIX))
    )
    return (
        f"Simulator records: {jobs} job(s), {candidates} candidate(s), {applications} application(s), {interviews} interview(s), "
        f"{sign_ins} linked sign-in(s), {invited} invitation email(s) sent, {events} webhook event(s)"
    )


# Internals


async def _deliver(factory: async_sessionmaker[AsyncSession], payload: dict[str, Any]) -> tuple[WebhookAck, FollowUps]:
    """Hand the webhook to the processor the endpoint uses, signed as Ashby signs it, in a session of its own."""
    body = json.dumps(payload).encode()
    secret = secrets.token_hex(32)  # this delivery's only: ASHBY_WEBHOOK_SECRET is never read or changed
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    async with factory() as session:
        processor = WebhookProcessor(
            session,
            secret=secret,
            client=None,  # simulator records don't exist in Ashby, so nothing is ever looked up there
            title_map=settings.ashby_stage_title_map,
            invites_enabled=settings.portal_invites_enabled,
            auto_analyze=settings.ashby_auto_analyze,
        )
        return await processor.handle(body, signature)


async def _follow_up(
    factory: async_sessionmaker[AsyncSession],
    follow_ups: FollowUps,
    admin: SupabaseAdmin | None,
    provider: AIProvider | None,
) -> list[str]:
    """What the webhook endpoint runs once it has responded: portal invitations, then AI analyses."""
    lines = []
    candidate_ids = sorted(follow_ups.invite_candidate_ids)
    await account_provisioning.provision_in_background(factory, candidate_ids, admin)
    async with factory() as session:
        for candidate_id in candidate_ids:
            if admin is None:
                # Provisioning's "not set up" message isn't true here: the simulator chose not to send.
                await session.execute(
                    update(Candidate)
                    .where(
                        Candidate.id == candidate_id,
                        Candidate.portal_invite_error == account_provisioning.NOT_CONFIGURED,
                    )
                    .values(portal_invite_error=NO_EMAIL_NOTE)
                )
                await session.commit()
            candidate = await session.get(Candidate, candidate_id, populate_existing=True)
            if candidate is not None:
                lines.append(f"Portal provisioning: {candidate.portal_status}")
    for application_id in sorted(follow_ups.analyze_application_ids):
        provider = provider or get_ai_provider()
        await ai_service.analyze_in_background(factory, application_id, provider)
        lines.append(f"AI analysis: requested from the {provider.name} provider")
    return lines


async def _check_unclaimed(session: AsyncSession, email: str) -> None:
    """Refuse an address that belongs to someone outside the simulator: importing would link them."""
    candidate = await session.scalar(select(Candidate).where(Candidate.email == email))
    if candidate is not None and not is_demo(candidate.external_id):
        raise DemoError(f"{email} belongs to a candidate who isn't simulator data. Use another address.")
    user = await session.scalar(select(User).where(User.email == email))
    if user is not None and (candidate is None or candidate.user_id != user.id):
        raise DemoError(f"{email} belongs to a Talent Bridge sign-in that isn't simulator data. Use another address.")


async def _demo_application(
    session: AsyncSession, email: str, job_title: str | None
) -> tuple[Application, Candidate, Job]:
    query = (
        select(Application, Candidate, Job)
        .join(Candidate, Application.candidate_id == Candidate.id)
        .join(Job, Application.job_id == Job.id)
        .where(Candidate.email == email, Application.external_id.startswith(DEMO_PREFIX))
    )
    if job_title:
        query = query.where(func.lower(Job.title) == job_title.strip().lower())
    rows = (await session.execute(query)).all()
    if not rows:
        to = f" to {job_title.strip()}" if job_title else ""
        raise DemoError(f"No simulator application from {email}{to}. Run apply first.")
    if len(rows) > 1:
        titles = ", ".join(sorted(job.title for _, _, job in rows))
        raise DemoError(f"{email} has {len(rows)} simulator applications ({titles}). Choose one with --job.")
    application, candidate, job = rows[0]
    return application, candidate, job


def _email(value: str) -> str:
    email = value.strip().lower()
    local, _, domain = email.partition("@")
    if not local or "." not in domain:
        raise DemoError(f"{value!r} isn't an email address.")
    return email


def _job_title(value: str) -> str:
    title = value.strip()
    if not title:
        raise DemoError("The job title can't be blank.")
    return title


def _ack_line(ack: WebhookAck) -> str:
    line = f"{ack.action}: {ack.status}"
    if ack.status == "duplicate":
        line += " (delivered before, so nothing was applied again)"
    return f"{line} ({ack.detail})" if ack.detail else line


def _invite_admin(email: str, dialect: str) -> SupabaseAdmin:
    """The real Supabase admin, for --send-invite, once it's sure the email can arrive and be linked."""
    if not can_receive_mail(email):
        raise DemoError(
            f"{email.rpartition('@')[2]} can't receive email, so an invitation would only bounce. "
            "Use an address you can receive, or leave out --send-invite."
        )
    if dialect != "postgresql":
        raise DemoError(
            "--send-invite creates a real Supabase sign-in, so DATABASE_URL must be your Supabase database."
        )
    admin = get_supabase_admin()
    if admin is None:
        raise DemoError("--send-invite needs SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.")
    return admin


# CLI


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m app.integrations.ashby.demo",
        description="Development only: simulate Ashby webhooks through the real import path. Refuses ENVIRONMENT=production.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="show the integration's log lines")
    commands = parser.add_subparsers(dest="command", required=True)

    command = commands.add_parser("apply", help="a candidate applies in Ashby")
    command.add_argument("--email", required=True)
    command.add_argument("--first-name", default="")
    command.add_argument("--last-name", default="")
    command.add_argument("--job", default=DEFAULT_JOB, help=f"job title (default: {DEFAULT_JOB})")
    command.add_argument(
        "--send-invite",
        action="store_true",
        help="send a real Supabase invitation email (to an address you can receive)",
    )

    command = commands.add_parser("stage", help="Ashby moves the application to another stage")
    command.add_argument("--email", required=True)
    command.add_argument("--stage", required=True, type=str.lower, choices=list(STAGE_EVENTS))
    command.add_argument("--job", help="job title, if the candidate applied to more than one")

    command = commands.add_parser("interview", help="Ashby schedules an interview")
    command.add_argument("--email", required=True)
    command.add_argument("--job", help="job title, if the candidate applied to more than one")
    command.add_argument("--in-days", type=int, default=3, help="days from today, at 16:00 UTC (default: 3)")

    commands.add_parser("status", help="show the simulator's candidates as recruiters and candidates see them")
    commands.add_parser("reset", help="delete what the simulator and the demo careers site made, and nothing else")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.ERROR, format="%(levelname)s: %(message)s")
    try:
        require_development()
    except DemoError as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(_run(args)))


async def _run(args: argparse.Namespace) -> int:
    from app.core.database import create_tables, dispose_engine, get_engine, get_sessionmaker

    engine = get_engine()
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    try:
        if engine.dialect.name == "sqlite":
            await create_tables(engine)  # as the API does on startup; supabase/migrations owns Postgres
        factory = get_sessionmaker()
        if args.command == "apply":
            admin = _invite_admin(_email(args.email), engine.dialect.name) if args.send_invite else None
            outcome = await apply(
                factory,
                email=args.email,
                first_name=args.first_name,
                last_name=args.last_name,
                job_title=args.job,
                admin=admin,
                provider=get_ai_provider(),
            )
        elif args.command == "stage":
            outcome = await stage(factory, email=args.email, stage=args.stage, job_title=args.job)
        elif args.command == "interview":
            outcome = await interview(factory, email=args.email, job_title=args.job, in_days=args.in_days)
        elif args.command == "status":
            outcome = await status(factory)
        else:
            outcome = await reset(factory)
        for line in outcome.lines:
            print(line)
        async with factory() as session:
            if outcome.email:
                print()
                for line in await describe(session, outcome.email):
                    print(line)
            print()
            print(await totals(session))
        return 0
    except (DemoError, AppError) as exc:
        print(f"Not done: {exc}", file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f"Database error: {str(exc).splitlines()[0]}", file=sys.stderr)
        print(
            "On Supabase, apply every file in supabase/migrations first (011 and 012 add the Ashby tables, "
            "013 the demo careers site's).",
            file=sys.stderr,
        )
        return 1
    finally:
        await dispose_engine()


if __name__ == "__main__":
    main()
