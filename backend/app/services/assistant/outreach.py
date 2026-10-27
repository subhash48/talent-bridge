"""Personalized outreach to the candidates the recruiter picked, and the interviews it proposes.

"Draft interview invitations for the selected candidates" writes one draft per candidate from their
own application (communication/drafts.create_personal_drafts), never one message for everyone.
"Make these 30-minute interviews next Tuesday afternoon" proposes a time for each, in the recruiter's
time zone, and rewrites the drafts to name it. All of it waits in one proposal (assistant_actions)
until the recruiter approves it, after one final look at the candidates, messages and times together.

Approving runs the existing services, once, for the candidates still ticked: first a check that their
draft is still the one approved, then each interview is created in Kavuntra (interview_service), the
calendar provider is asked for an event (none is connected, so none is claimed), the message goes
through the one send path (portal, timeline, and email when configured), and only then is candidate
messaging turned on. Each candidate's outcome is reported on its own, and one candidate's failure
never stops or hides the others'; nothing claims more than happened.
"""

import logging
import re
import uuid
from datetime import datetime, tzinfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import AssistantActionStatus, EmailStatus
from app.core.errors import AppError, BadRequestError, ConflictError, NotFoundError
from app.integrations.calendar import NOT_CONFIGURED, CalendarEvent, CalendarProvider
from app.integrations.email import EmailProvider
from app.models import Application, User
from app.schemas.ai import DraftPurpose
from app.schemas.assistant import (
    CandidateBrief,
    ConfirmActionRequest,
    OutreachCard,
    OutreachItem,
    OutreachItemEdit,
    OutreachResult,
    ScheduleDetails,
    ScheduleEdit,
    ScheduleProposal,
)
from app.schemas.interview import InterviewCreate
from app.services import application_service, interview_service
from app.services.ai.client import AIProvider
from app.services.assistant import schedule as times
from app.services.communication import drafts

logger = logging.getLogger(__name__)

S = AssistantActionStatus
INVITATION = "Interview invitation"
UNEXPECTED = "Something went wrong for this candidate, so nothing more was done for them. Check before trying again."
MESSAGE = "Message"
PORTAL_ONLY = "Portal delivered — Email not configured"
PORTAL_AND_EMAIL = "Candidate portal and email"
# A request that says what to write, rather than just asking for outreach.
SAYS_WHAT = re.compile(
    r"\b(tell|telling|say|saying|that|about|asking|ask|let them know|letting them know)\b", re.IGNORECASE
)


async def applications_for(session: AsyncSession, ids: list[uuid.UUID]) -> list[Application]:
    """The applications picked, in the order picked, with their candidate and job. Only active ones."""
    rows = await session.scalars(
        select(Application)
        .where(Application.id.in_(ids))
        .options(selectinload(Application.candidate), selectinload(Application.job))
    )
    found = {application.id: application for application in rows}
    missing = [application_id for application_id in ids if application_id not in found]
    if missing:
        raise NotFoundError("One of those candidates isn't in your pipeline any more.", code="application_not_found")
    applications = [found[application_id] for application_id in ids]
    archived = [application.candidate.full_name for application in applications if application.archived_at is not None]
    if archived:
        raise BadRequestError(
            f"Restore {', '.join(archived)} to the pipeline before reaching out.", code="application_archived"
        )
    return applications


def brief(application: Application) -> CandidateBrief:
    return CandidateBrief(
        application_id=application.id,
        candidate_id=application.candidate_id,
        name=application.candidate.full_name,
        job_title=application.job.title,
        stage=application.stage,
    )


def plan_schedule(
    details: ScheduleDetails,
    count: int,
    recruiter: User,
    tz: tzinfo,
    utc_offset_minutes: int,
    calendar: CalendarProvider,
    now: datetime,
) -> tuple[ScheduleProposal, list]:
    """The proposal and one slot per candidate (None where there's no room, or no day yet)."""
    # An interview is at least 15 minutes (interview_service's own limit), at most 8 hours.
    minutes = min(max(details.duration_minutes or times.DEFAULT_MINUTES, 15), 480)
    day = times.resolve_day(details.timeframe, now.astimezone(tz).date())
    window = times.window_for(details)
    slots = times.slots(count, day, window, minutes, tz, now)
    title = details.interview_type[:1].upper() + details.interview_type[1:] if details.interview_type else "Interview"
    proposal = ScheduleProposal(
        title=title,
        duration_minutes=minutes,
        day=day.isoformat() if day else None,
        window_start=window[0],
        window_end=window[1],
        utc_offset_minutes=utc_offset_minutes,
        time_zone=getattr(tz, "key", None),
        interviewers=[recruiter.full_name],
        calendar_configured=calendar.configured,
        calendar_note=f"Calendar invitations go out through {calendar.name}."
        if calendar.configured
        else NOT_CONFIGURED,
        unscheduled=sum(1 for slot in slots if slot is None),
    )
    return proposal, slots


async def propose(
    session: AsyncSession,
    recruiter: User,
    action_id: uuid.UUID,
    applications: list[Application],
    *,
    invitation: bool,
    instructions: str | None,
    details: ScheduleDetails | None,
    tz: tzinfo,
    utc_offset_minutes: int,
    provider: AIProvider,
    email: EmailProvider,
    calendar: CalendarProvider,
    now: datetime,
) -> OutreachCard:
    """One personalized draft per candidate, and the interview times proposed when details are given."""
    proposal, slots = (None, [None] * len(applications))
    if details is not None:
        proposal, slots = plan_schedule(details, len(applications), recruiter, tz, utc_offset_minutes, calendar, now)
    asks: dict[uuid.UUID, tuple[DraftPurpose, str | None]] = {}
    for application, slot in zip(applications, slots, strict=True):
        if proposal is not None and slot is not None:
            # The interview as proposed now comes first, and replaces any length or time in the request.
            lines = [
                f"Interview: {proposal.title}",
                f"Length: {proposal.duration_minutes} minutes",
                f"Proposed time: {times.describe(slot, tz)}.",
                f"The recruiter's request (the interview, length and time above replace any in it): {instructions}"
                if instructions
                else "",
            ]
            asks[application.id] = (DraftPurpose.INTERVIEW_PROPOSAL, "\n".join(line for line in lines if line)[:1000])
        elif invitation:
            asks[application.id] = (DraftPurpose.INTERVIEW_INVITATION, (instructions or "")[:500] or None)
        elif instructions and SAYS_WHAT.search(instructions):
            asks[application.id] = (DraftPurpose.CUSTOM, instructions[:500])
        else:
            asks[application.id] = (DraftPurpose.OUTREACH, None)
    # Read before drafting, which reloads the applications.
    facts = [(brief(app), app.job.company.name, app.candidate_messaging_enabled) for app in applications]
    # Replies are turned on with the send unless the recruiter says otherwise, so the drafts may ask for one.
    written = await drafts.create_personal_drafts(session, applications, asks, provider, recruiter, now, can_reply=True)
    items = [
        OutreachItem(
            candidate=candidate,
            company_name=company,
            draft_id=draft.id,
            subject=draft.subject,
            body=draft.body,
            replies_open=replies_open,
            slot=slot,
        )
        for (candidate, company, replies_open), draft, slot in zip(facts, written, slots, strict=True)
    ]
    return OutreachCard(
        action_id=action_id,
        status=S.PROPOSED,
        purpose=INVITATION if invitation or proposal is not None else MESSAGE,
        items=items,
        schedule=proposal,
        email_configured=email.configured,
        delivery_note=PORTAL_AND_EMAIL if email.configured else PORTAL_ONLY,
    )


def apply_edits(card: OutreachCard, edits: ConfirmActionRequest) -> OutreachCard:
    """The card as the recruiter left it: who's ticked, each subject and message, whether to open replies,
    and the interviewers, format and meeting link."""
    by_id = {item.application_id: item for item in edits.items or []}
    items = []
    for item in card.items:
        change = by_id.get(item.candidate.application_id)
        if change is not None:
            item = item.model_copy(
                update={
                    "include": change.include,
                    "subject": change.subject or item.subject,
                    "body": change.body or item.body,
                }
            )
        items.append(item)
    update: dict[str, object] = {"items": items}
    if edits.enable_replies is not None:
        update["enable_replies"] = edits.enable_replies
    if card.schedule is not None and edits.schedule is not None:
        changes = edits.schedule.model_dump(exclude_unset=True, exclude_none=True)
        if "meeting_url" in edits.schedule.model_fields_set:
            changes["meeting_url"] = edits.schedule.meeting_url
        update["schedule"] = card.schedule.model_copy(update=changes)
    return card.model_copy(update=update)


def as_confirmation(card: OutreachCard) -> ConfirmActionRequest:
    """Approving the card exactly as it is."""
    plan = card.schedule
    return ConfirmActionRequest(
        items=[
            OutreachItemEdit(
                application_id=item.candidate.application_id, include=item.include, subject=item.subject, body=item.body
            )
            for item in card.items
        ],
        enable_replies=card.enable_replies,
        schedule=ScheduleEdit(
            title=plan.title,
            interview_type=plan.interview_type,
            interviewers=plan.interviewers,
            meeting_url=plan.meeting_url,
        )
        if plan is not None
        else None,
    )


async def execute(
    session: AsyncSession,
    recruiter: User,
    card: OutreachCard,
    request: ConfirmActionRequest,
    email: EmailProvider,
    calendar: CalendarProvider,
) -> tuple[OutreachCard, str, str, AssistantActionStatus]:
    """Run what the recruiter approved, once: for each candidate still ticked, the interview, then the
    message. Returns the card with each outcome, the reply, the summary for Recent actions and the status."""
    card = apply_edits(card, request)
    if not any(item.include for item in card.items):
        raise BadRequestError("Tick at least one candidate to send to.", code="nothing_selected")
    plan, replies = card.schedule, card.enable_replies

    items: list[OutreachItem] = []
    for item in card.items:
        if not item.include:
            try:
                await drafts.discard_draft(session, item.draft_id)
            except AppError:
                await _recover(session, recruiter)  # already sent or discarded elsewhere
            items.append(item.model_copy(update={"include": False}))
            continue
        result = OutreachResult()
        application_id = item.candidate.application_id
        try:
            # Nothing happens for a candidate whose draft was replaced or sent since this was proposed.
            if not await drafts.is_open(session, item.draft_id):
                raise ConflictError(
                    "Their draft was replaced or sent since this was proposed, so nothing was done. Draft it again.",
                    code="draft_already_handled",
                )
            if plan is not None and item.slot is not None:
                interview = await interview_service.schedule_interview(
                    session,
                    application_id,
                    InterviewCreate(
                        title=plan.title,
                        interview_type=plan.interview_type,
                        scheduled_at=item.slot.starts_at,
                        duration_minutes=plan.duration_minutes,
                        meeting_url=plan.meeting_url,
                        interviewers=plan.interviewers,
                    ),
                    recruiter,
                )
                result.interview_created = True
                event = await calendar.create_event(
                    CalendarEvent(
                        title=f"{plan.title}: {item.candidate.name}",
                        starts_at=interview.scheduled_at,
                        duration_minutes=plan.duration_minutes,
                        attendee_email=(await _candidate_email(session, application_id)),
                        organizer=recruiter.email,
                        meeting_url=plan.meeting_url,
                        idempotency_key=str(interview.id),
                        interviewers=plan.interviewers,
                    )
                )
                result.calendar = event.status
            sent = await drafts.send_draft(session, item.draft_id, item.subject, item.body, recruiter, email)
            result.message_sent = True
            delivery = sent.message.delivery
            result.email = (delivery.email_status if delivery else EmailStatus.NOT_CONFIGURED).value  # type: ignore[assignment]
            body, subject = sent.message.content, sent.draft.subject
            # Last, so they can only reply to a message that was sent.
            if replies and not item.replies_open:
                await application_service.set_messaging(session, [application_id], True, recruiter)
                result.messaging_enabled = True
        except AppError as exc:
            await _recover(session, recruiter)
            result.error = exc.message
            body, subject = item.body, item.subject
        except Exception:
            logger.exception("assistant.outreach_item_failed application=%s", application_id)
            await _recover(session, recruiter)
            result.error = UNEXPECTED
            body, subject = item.body, item.subject
        items.append(item.model_copy(update={"result": result, "body": body, "subject": subject}))

    done = [item for item in items if item.result and item.result.message_sent]
    failed = [item for item in items if item.result and not item.result.message_sent]
    status = S.COMPLETED if not failed else S.FAILED
    card = card.model_copy(
        update={"items": items, "schedule": plan, "enable_replies": replies, "stage": "done", "status": status}
    )
    return card, _reply(card, done, failed), _summary(card, done), status


def _reply(card: OutreachCard, done: list[OutreachItem], failed: list[OutreachItem]) -> str:
    what = "interview invitation" if card.purpose == INVITATION else "message"
    lines = []
    if done:
        names = _names([item.candidate.name for item in done])
        how = (
            "in their candidate portal"
            if card.email_configured
            else "to their candidate portal (email isn't set up, so nothing was emailed)"
        )
        lines.append(f"Sent {len(done)} personalized {what}{'s' if len(done) != 1 else ''} to {names}, {how}.")
        # Email only as it actually went, candidate by candidate.
        for status, said in (
            ("sent", "Emailed to {}."),
            ("pending", "The email to {} is on its way."),
            ("failed", "The email failed for {}; the message is in their portal."),
        ):
            who = [item.candidate.name for item in done if item.result and item.result.email == status]
            if card.email_configured and who:
                lines.append(said.format(_names(who)))
    interviews = [item for item in done if item.result and item.result.interview_created]
    if interviews:
        calendar = (
            "calendar invitations were sent"
            if all(item.result and item.result.calendar == "created" for item in interviews)
            else "no calendar invitations were sent, because calendar integration isn't set up"
        )
        lines.append(
            f"Created {len(interviews)} interview{'s' if len(interviews) != 1 else ''} in Kavuntra; {calendar}."
        )
    opened = [item for item in done if item.result and item.result.messaging_enabled]
    if opened:
        lines.append(
            f"Turned on candidate messaging for {_names([item.candidate.name for item in opened])}, so they can reply."
        )
    for item in failed:
        result = item.result
        assert result is not None
        partial = " Their interview was created." if result.interview_created else ""
        lines.append(f"Couldn't send to {item.candidate.name}: {result.error}{partial}")
    return " ".join(lines) or "Nothing was sent."


def _summary(card: OutreachCard, done: list[OutreachItem]) -> str:
    what = "interview invitation" if card.purpose == INVITATION else "message"
    if not done:
        return f"Couldn't send {what}s"
    return f"Sent {len(done)} personalized {what}{'' if len(done) == 1 else 's'}"


def _names(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


async def _recover(session: AsyncSession, recruiter: User) -> None:
    """After one candidate's failure: undo what wasn't committed, and reload the recruiter the rollback
    expired, so the next candidate is handled normally."""
    await session.rollback()
    await session.refresh(recruiter)


async def _candidate_email(session: AsyncSession, application_id: uuid.UUID) -> str:
    application = await session.get(Application, application_id, options=[selectinload(Application.candidate)])
    return application.candidate.email if application else ""
