"""The recruiter assistant's action engine. Typed and spoken requests take exactly the same path:

    words (typed, or a transcript) -> one structured action (understand.py)
    -> policy checks -> who and what it's about (resolve.py, search.py) -> a plan:
       a question is answered (who needs an update, unanswered messages, interviews to confirm or
       follow up on, one candidate's status); a candidate list is shown with its filters and each
       candidate's evidence (search.py); the recruiter's ticks are kept; a message, personalized
       outreach with interview times (outreach.py) or a new job (jobs.py) becomes a proposal
    -> the recruiter approves a proposal, after one final look (confirm()) -> the existing services
       run it, once.

Every request is recorded (assistant_actions): the words, the structured action, the target and the
result. A repeated request (same client_request_id) returns the first one's answer instead of doing
anything twice, and a proposal's status moves on exactly once, so one approval is one send.

What runs is always an existing TalentBridge service: communication drafts (sent through the one send
path: candidate portal, timeline and email when configured), message_service, interview_service (with
the calendar provider, which isn't connected, so no invitation is claimed), job_service for a new job,
candidate_matching for lists and the communication health behind Today. Nothing here decides anything
about a candidate: it never ranks, scores, advances or rejects anyone, and it only acts on the
candidates the recruiter picked.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import MANUAL_DRAFT, AssistantActionStatus, EmailStatus
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.calendar import CalendarProvider, DisabledCalendar
from app.integrations.email import DisabledEmail, EmailProvider
from app.models import Application, AssistantAction, Job, User
from app.models.base import utcnow
from app.schemas.ai import AISource, DraftPurpose
from app.schemas.assistant import (
    AssistantCard,
    AssistantContext,
    AssistantHistoryItem,
    AssistantIntent,
    AssistantRequest,
    AssistantResponse,
    CandidateBrief,
    ClarifyCard,
    ClarifyOption,
    ConfirmActionRequest,
    InterviewDetails,
    JobChanges,
    JobDraftCard,
    MessageCard,
    OutreachCard,
    ScheduleDetails,
    SearchState,
)
from app.schemas.message import MessageRead
from app.services import ai_service, message_service
from app.services.ai.client import AIProvider
from app.services.assistant import answers, jobs, outreach, search
from app.services.assistant import schedule as times
from app.services.assistant.resolve import Resolution, resolve_candidate
from app.services.assistant.understand import asks_for_top, policy_refusal, understand
from app.services.communication import drafts

logger = logging.getLogger(__name__)

S = AssistantActionStatus
DELIVERY = "Candidate portal messages"
# A request for an update with nothing more to say than that.
BARE_UPDATE = re.compile(
    r"\b(an? )?(quick )?(update|follow[- ]?up|check[- ]in|status update)\s*[.!]?\s*$|^\s*(remind|nudge)\b",
    re.IGNORECASE,
)
HISTORY_STATUSES = (S.COMPLETED, S.FAILED)
PICK_FIRST = (
    'Tick the candidates first, in the list or on the Candidates page, or say who: "Select Sophia, Maya and James".'
)


@dataclass
class Outcome:
    reply: str
    status: AssistantActionStatus = S.ANSWERED
    cards: list[AssistantCard] = field(default_factory=list)
    sources: list[AISource] = field(default_factory=list)
    context: AssistantContext = field(default_factory=AssistantContext)
    target_type: str | None = None
    target_id: uuid.UUID | None = None
    target_label: str | None = None
    summary: str | None = None  # for Recent actions, when something was done
    payload: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class Context:
    """The conversation's context, checked: ids the workspace sent that still mean something."""

    application: Application | None = None
    proposal: AssistantAction | None = None
    job: Job | None = None
    search: SearchState | None = None
    selected: list[uuid.UUID] = field(default_factory=list)

    @property
    def proposal_kind(self) -> str | None:
        return (self.proposal.payload or {}).get("kind") if self.proposal is not None else None

    def keep(self) -> AssistantContext:
        """What stays in context after a request that doesn't change it."""
        return AssistantContext(
            application_id=self.application.id if self.application else None,
            job_id=self.job.id if self.job else None,
            search=self.search,
            selected_application_ids=self.selected,
        )

    def describe(self) -> str:
        lines = []
        if self.application is not None:
            lines.append(f"Candidate in focus: {self.application.candidate.full_name}, {self.application.job.title}")
        if self.job is not None:
            lines.append(f'Job in context ("that role"): {self.job.title}')
        if self.search is not None:
            lines.append("A candidate list is on screen (searches can narrow it)")
        if self.selected:
            lines.append(f"Candidates ticked by the recruiter: {len(self.selected)}")
        if self.proposal is not None:
            kind = self.proposal_kind or "message"
            lines.append(
                f"Waiting for approval: a {'job draft' if kind == 'job' else kind} ({self.proposal.target_label})"
            )
        return "\n".join(lines)


# Requests


async def handle(
    session: AsyncSession,
    recruiter: User,
    request: AssistantRequest,
    provider: AIProvider,
    email: EmailProvider | None = None,
    calendar: CalendarProvider | None = None,
    *,
    intent: AssistantIntent | None = None,
) -> AssistantResponse:
    """One request. Words are understood first; a workspace button (the Candidates page's "Draft
    personalized outreach") comes with its intent already structured, and takes the same path from there."""
    email = email or DisabledEmail()
    calendar = calendar or DisabledCalendar()
    if request.client_request_id:
        existing = await _by_request(session, recruiter, request.client_request_id)
        if existing is not None:
            return _replay(existing)
    row = AssistantAction(
        id=uuid.uuid4(),
        recruiter_id=recruiter.id,
        client_request_id=request.client_request_id,
        input_type=request.input_type.value,
        input_text=request.text,
        status=S.PROCESSING,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()  # the same request, arriving twice at once
        existing = await _by_request(session, recruiter, request.client_request_id or "")
        if existing is None:
            raise
        return _replay(existing)
    row_id = row.id

    context = await _context(session, recruiter, request.context)
    if intent is not None:
        model_name = "workspace"  # chosen with the workspace's controls, not read from words
    else:
        intent, model_name = await understand(
            request.text,
            context.describe(),
            provider,
            proposal_kind=context.proposal_kind if context.proposal is not None else None,  # type: ignore[arg-type]
            has_selection=bool(context.selected),
        )
    try:
        outcome = await _plan(session, recruiter, row_id, intent, request, context, provider, email, calendar)
    except AppError as exc:
        await session.rollback()
        outcome = Outcome(reply=exc.message, context=context.keep())
    except Exception:
        await session.rollback()
        logger.exception("assistant.request_failed action=%s intent=%s", row_id, intent.action)
        outcome = Outcome(reply="Something went wrong on our side. Nothing was changed. Try again.", status=S.FAILED)

    row = await _reload(session, row_id)
    response = AssistantResponse(
        id=row.id,
        input_type=request.input_type,
        transcript=request.text,
        intent=intent.action,
        status=outcome.status,
        reply=outcome.reply,
        cards=outcome.cards,
        sources=outcome.sources,
        context=outcome.context,
        model_name=model_name,
    )
    now = utcnow()
    row.intent = intent.action
    row.status = outcome.status
    row.target_type, row.target_id, row.target_label = outcome.target_type, outcome.target_id, outcome.target_label
    row.result_summary = outcome.summary
    row.error = outcome.error
    if outcome.status in HISTORY_STATUSES:
        row.executed_at = now
    row.payload = {
        **outcome.payload,
        "intent": intent.model_dump(mode="json", exclude_none=True),
        "response": response.model_dump(mode="json"),
    }
    row.updated_at = now
    await session.commit()
    return response


async def _plan(
    session: AsyncSession,
    recruiter: User,
    row_id: uuid.UUID,
    intent: AssistantIntent,
    request: AssistantRequest,
    context: Context,
    provider: AIProvider,
    email: EmailProvider,
    calendar: CalendarProvider,
) -> Outcome:
    resolution = await resolve_candidate(
        session,
        name=intent.candidate_name,
        text=request.text,
        job_title=intent.job_title,
        context_application_id=request.context.application_id,
    )
    refusal = policy_refusal(request.text, intent, names_a_person=bool(resolution.matches))
    keep = context.keep()
    if refusal:
        return Outcome(reply=refusal, context=keep)

    action = intent.action
    if action in ("send_interview_email", "draft_message"):
        return await _propose_message(session, recruiter, row_id, intent, request, resolution, keep, provider)
    if action == "confirm":
        return await _confirm_in_context(session, recruiter, intent, context, keep, email, calendar)
    if action == "cancel":
        return await _cancel_in_context(session, recruiter, context, keep)
    if action == "create_job":
        return await _create_job(row_id, intent.job or JobChanges(), keep, provider)
    if action == "update_job":
        return await _update_job(session, intent.job or JobChanges(), context, keep)
    if action == "search_candidates":
        return await _search(session, intent, request, context, keep)
    if action == "select_candidates":
        return await _select(session, intent, context, keep)
    if action == "draft_outreach":
        return await _draft_outreach(
            session, recruiter, row_id, intent, request, context, keep, provider, email, calendar
        )
    if action == "schedule_interviews":
        return await _schedule(session, recruiter, row_id, intent, request, context, keep, provider, email, calendar)
    if action == "who_needs_update":
        reply, card = await answers.who_needs_update(session)
        return Outcome(reply=reply, cards=[card], context=keep)
    if action == "unanswered":
        reply, card = await answers.unanswered(session)
        return Outcome(reply=reply, cards=[card], context=keep)
    if action == "unconfirmed_interviews":
        reply, card = await answers.unconfirmed_interviews(session, request.utc_offset_minutes)
        return Outcome(reply=reply, cards=[card], context=keep)
    if action == "no_follow_up":
        reply, card = await answers.no_follow_up(session)
        return Outcome(reply=reply, cards=[card], context=keep)
    if action in ("candidate_info", "next_interview"):
        application, clarification = _one(resolution, request)
        if application is None:
            clarification.context = keep
            return clarification
        keep = keep.model_copy(update={"application_id": application.id})
        if action == "next_interview":
            reply, interview_card = await answers.next_interview(session, application, request.utc_offset_minutes)
            return Outcome(reply=reply, cards=[interview_card], context=keep)
        result = await ai_service.ask_candidate(session, application.id, request.text, provider, recruiter)
        return Outcome(reply=result.answer, sources=result.sources, context=keep)
    return Outcome(reply=answers.HELP, context=keep)


def delivered(message: MessageRead) -> str:
    """Where a sent message went, in a sentence."""
    delivery = message.delivery
    status = delivery.email_status if delivery else EmailStatus.NOT_CONFIGURED
    if status == EmailStatus.SENT:
        return "It was emailed and is in their candidate portal messages."
    if status == EmailStatus.FAILED:
        return f"It's in their candidate portal messages, but the email failed: {delivery.error if delivery else ''}"
    if status == EmailStatus.PENDING:
        return "It's in their candidate portal messages; the email is on its way."
    return "It's in their candidate portal messages. Email isn't set up, so it wasn't emailed."


def _one(resolution: Resolution, request: AssistantRequest) -> tuple[Application | None, Outcome]:
    """The one application a request means, or what to tell the recruiter instead. Never a guess."""
    if resolution.one is not None:
        return resolution.one, Outcome(reply="")
    if not resolution.matches:
        who = f"anyone called **{resolution.name}**" if resolution.name else "who you mean"
        reply = (
            f"I couldn't find {who} in your active pipeline. Check the name, or open the candidate's page."
            if resolution.name
            else 'Which candidate? Say their name, for example "Tell me about Sophia\'s application".'
        )
        return None, Outcome(reply=reply)
    return None, _clarify(resolution, request)


def _clarify(resolution: Resolution, request: AssistantRequest) -> Outcome:
    people = {app.candidate_id for app in resolution.matches}
    first = resolution.matches[0].candidate.first_name
    if len(people) == 1:
        question = f"{resolution.matches[0].candidate.full_name} has {len(resolution.matches)} applications. Which one?"
    else:
        question = f"I found {len(people)} candidates named {resolution.name or first}. Which one?"
    options = [
        ClarifyOption(
            label=app.candidate.full_name,
            # The employer too: one person can apply for the same title at two companies.
            detail=f"{app.job.title} at {app.job.company.name} · {app.stage.label}",
            reply=request.text,
            application_id=app.id,
        )
        for app in resolution.matches[:8]
    ]
    return Outcome(
        reply=question,
        status=S.NEEDS_CLARIFICATION,
        cards=[ClarifyCard(question=question, options=options)],
    )


# Messages


async def _propose_message(
    session: AsyncSession,
    recruiter: User,
    row_id: uuid.UUID,
    intent: AssistantIntent,
    request: AssistantRequest,
    resolution: Resolution,
    keep: AssistantContext,
    provider: AIProvider,
) -> Outcome:
    application, clarification = _one(resolution, request)
    if application is None:
        clarification.context = keep
        return clarification
    if application.archived_at is not None:
        return Outcome(
            reply=f"{application.candidate.first_name} isn't in the active pipeline. Restore them before messaging them.",
            context=keep,
        )
    candidate = answers.brief(application)  # before drafting, which reloads the application
    interview = (intent.interview or InterviewDetails()) if intent.action == "send_interview_email" else None
    draft_id: uuid.UUID | None = None
    if interview is None:
        # 'Draft Sarah an update' is written for the rule that needs attention; 'tell Daniel his interview
        # moved' says what was asked. Either way it's in the drafts ledger.
        bare = BARE_UPDATE.search(request.text) is not None
        written = await drafts.create_draft(
            session,
            application.id,
            None if bare else MANUAL_DRAFT,
            None if bare else request.text[:500],
            provider,
            recruiter,
        )
        subject, body, draft_id = written.subject, written.body, written.id
    else:
        details = [
            request.text,
            f"Thank them for their interest in the {candidate.job_title} role, naming it",
            f"Interview: {interview.interview_type}" if interview.interview_type else "",
            f"Length: {interview.duration_minutes} minutes" if interview.duration_minutes else "",
            f"Timing: {interview.timeframe}" if interview.timeframe else "",
        ]
        invitation = await ai_service.draft_message(
            session,
            application.id,
            DraftPurpose.INTERVIEW_INVITATION,
            ". ".join(part for part in details if part)[:500],
            provider,
            recruiter,
        )
        subject, body = invitation.subject, invitation.body
    label = "Interview invitation" if interview is not None else ("Update" if bare else "Message")
    card = MessageCard(
        action_id=row_id,
        mode=intent.mode,
        status=S.PROPOSED,
        candidate=candidate,
        purpose=label,
        interview_type=interview.interview_type if interview else None,
        duration_minutes=interview.duration_minutes if interview else None,
        timeframe=interview.timeframe if interview else None,
        body=body,
        delivery=DELIVERY,
    )
    if intent.mode == "draft":
        reply = f"Here's a draft for **{candidate.name}**. Nothing has been sent."
    else:
        reply = f"Ready to send to **{candidate.name}**. Check the message, then confirm."
    if resolution.approximate:
        reply = f"I took “{resolution.name}” to mean {candidate.name}. {reply}"
    return Outcome(
        reply=reply,
        status=S.PROPOSED,
        cards=[card],
        context=keep.model_copy(update={"application_id": application.id, "action_id": row_id}),
        target_type="application",
        target_id=application.id,
        target_label=candidate.name,
        payload={
            "kind": "message",
            "card": card.model_dump(mode="json"),
            "subject": subject,
            "draft_id": str(draft_id) if draft_id else None,
        },
    )


async def _confirm_in_context(
    session: AsyncSession,
    recruiter: User,
    intent: AssistantIntent,
    context: Context,
    keep: AssistantContext,
    email: EmailProvider,
    calendar: CalendarProvider,
) -> Outcome:
    """ "Looks good", "send them", "yes": the proposal in context. The first time it's shown ready to approve,
    with everything it will do; only a yes to that (or "approve" for a job draft) runs it. A transcript can
    be wrong, so nothing runs on the first word alone."""
    proposal = context.proposal
    if proposal is None:
        return Outcome(reply="There's nothing waiting to be approved.", context=keep)
    payload = dict(proposal.payload or {})
    kind = payload.get("kind", "message")
    if payload.get("final") or (kind == "job" and intent.mode == "execute"):
        result = await confirm(session, recruiter, proposal.id, ConfirmActionRequest(), email, calendar)
        return Outcome(
            reply=result.reply, cards=result.cards, context=keep.model_copy(update=_without_none(result.context))
        )
    keep = keep.model_copy(update={"action_id": proposal.id})
    card: AssistantCard
    if kind == "job":
        card = JobDraftCard.model_validate({**payload["card"], "stage": "confirm"})
        reply = f"Create this job? **{card.draft.title}** will open on your careers site. Say yes, or press Approve & Create."
    elif kind == "outreach":
        card = OutreachCard.model_validate({**payload["card"], "stage": "final"})
        reply = _final_summary(card)
    else:
        card = MessageCard.model_validate({**payload["card"], "mode": "execute"})
        reply = f"Ready to send to **{card.candidate.name}**. Confirm to send it."
    await _save_payload(session, proposal.id, {**payload, "card": card.model_dump(mode="json"), "final": True})
    return Outcome(reply=reply, cards=[card], context=keep)


def _final_summary(card: OutreachCard) -> str:
    chosen = [item for item in card.items if item.include]
    names = _names([item.candidate.name for item in chosen])
    what = "interview invitation" if card.purpose == outreach.INVITATION else "message"
    lines = [f"Ready to send {len(chosen)} personalized {what}{'s' if len(chosen) != 1 else ''} to {names}."]
    if card.schedule is not None:
        scheduled = [item for item in chosen if item.slot is not None]
        lines.append(
            f"{len(scheduled)} {card.schedule.duration_minutes}-minute interview{'s' if len(scheduled) != 1 else ''} "
            "will be created in TalentBridge."
        )
        if not card.schedule.calendar_configured:
            lines.append(card.schedule.calendar_note)
    lines.append(f"Delivery: {card.delivery_note}.")
    lines.append("Check the candidates, messages and times below, then say yes or press Confirm & send.")
    return " ".join(lines)


async def _cancel_in_context(
    session: AsyncSession, recruiter: User, context: Context, keep: AssistantContext
) -> Outcome:
    if context.proposal is None:
        return Outcome(reply="There's nothing to cancel.", context=keep)
    kind = context.proposal_kind
    await cancel(session, recruiter, context.proposal.id)
    reply = "Cancelled. No job was created." if kind == "job" else "Cancelled. Nothing was sent or scheduled."
    return Outcome(reply=reply, context=keep.model_copy(update={"action_id": None}))


# Jobs


async def _create_job(row_id: uuid.UUID, changes: JobChanges, keep: AssistantContext, provider: AIProvider) -> Outcome:
    if not changes.title:
        return Outcome(
            reply='What\'s the job called? For example: "Create a Senior Product Designer role in New York, hybrid."',
            context=keep,
        )
    draft, checks, model_name = await jobs.draft(changes, provider)
    card = JobDraftCard(action_id=row_id, status=S.PROPOSED, draft=draft, missing=checks, model_name=model_name)
    return Outcome(
        reply=f"I drafted the **{draft.title}** role. Review it before creating: no job exists until you approve it.",
        status=S.PROPOSED,
        cards=[card],
        context=keep.model_copy(update={"action_id": row_id}),
        target_type="job_draft",
        target_label=draft.title,
        payload={"kind": "job", "card": card.model_dump(mode="json"), "final": False},
    )


async def _update_job(session: AsyncSession, changes: JobChanges, context: Context, keep: AssistantContext) -> Outcome:
    proposal = context.proposal
    if proposal is None or context.proposal_kind != "job":
        return Outcome(reply='There\'s no job draft open. Say "Create a … role" to start one.', context=keep)
    payload = dict(proposal.payload or {})
    card = JobDraftCard.model_validate(payload["card"])
    draft, described = jobs.update(card.draft, changes)
    keep = keep.model_copy(update={"action_id": proposal.id})
    if not described:
        return Outcome(
            reply='I didn\'t catch what to change. Try "Add Kubernetes" or "Make it remote".',
            cards=[card],
            context=keep,
        )
    card = card.model_copy(
        update={"draft": draft, "changes": described, "missing": jobs.checks(draft), "stage": "draft"}
    )
    await _save_payload(session, proposal.id, {**payload, "card": card.model_dump(mode="json"), "final": False})
    return Outcome(
        reply=f"Updated the draft: {'; '.join(described)}. Review it, then approve to create it.",
        cards=[card],
        context=keep,
    )


# Candidates


async def _search(
    session: AsyncSession, intent: AssistantIntent, request: AssistantRequest, context: Context, keep: AssistantContext
) -> Outcome:
    try:
        state = await search.state_for(session, intent, request.text, keep)
    except search.JobNotFound as missing:
        return Outcome(reply=f"I couldn't find a job called **{missing.title}**.", context=keep)
    if state.job_ids == [] and intent.job_title and search.THAT_JOB.match(intent.job_title) and context.job is None:
        return Outcome(
            reply='Which role? Say its title, for example "Show applicants for Product Designer".', context=keep
        )
    card = await search.run(session, state, context.selected)
    return Outcome(
        reply=search.reply(card, ranked=asks_for_top(request.text)),
        cards=[card],
        context=keep.model_copy(update={"search": state}),
    )


async def _select(session: AsyncSession, intent: AssistantIntent, context: Context, keep: AssistantContext) -> Outcome:
    selected = list(context.selected)
    if intent.selection == "clear":
        selected = []
    else:
        names = intent.candidate_names or ([intent.candidate_name] if intent.candidate_name else [])
        if not names:
            return Outcome(reply='Who should I select? Say their names, like "Select Sophia and Maya".', context=keep)
        found, unknown, unclear = await search.resolve_names(session, names, context.search)
        if unclear:
            name, hits = next(iter(unclear.items()))
            return Outcome(
                reply=f"More than one {name} could be meant: "
                + "; ".join(detail for _, detail in hits[:6])
                + ". Tick the right one in the list.",
                context=keep,
            )
        if intent.selection == "remove":
            selected = [item for item in selected if item not in found]
        elif intent.selection == "add":
            selected = list(dict.fromkeys([*selected, *found]))
        else:
            selected = found
        if unknown:
            return Outcome(
                reply=f"I couldn't find {_names(unknown)} in your active pipeline, so I changed nothing. Check the "
                "names, or tick them in the list.",
                context=keep,
            )
    keep = keep.model_copy(update={"selected_application_ids": selected})
    card = await search.run(session, context.search or SearchState(limit=max(10, len(selected))), selected)
    # Ticked candidates the list doesn't show are still shown, so the recruiter sees everyone selected.
    missing = [item for item in selected if item not in {match.application_id for match in card.items}]
    if missing:
        extra = await search.run(session, SearchState(limit=200), selected)
        card.items += [match for match in extra.items if match.application_id in missing]
    names = [match.name for match in card.items if match.application_id in selected]
    reply = (
        f"Selected **{_names(names)}**. What you do next applies to them only."
        if selected
        else "Nobody is selected now."
    )
    return Outcome(reply=reply, cards=[card], context=keep)


# Outreach and interviews


async def _targets(session: AsyncSession, intent: AssistantIntent, context: Context) -> list[uuid.UUID] | str:
    """The candidates an outreach request means: the ones it names, else the ones ticked."""
    if intent.candidate_names:
        found, unknown, unclear = await search.resolve_names(session, intent.candidate_names, context.search)
        if unknown:
            return f"I couldn't find {_names(unknown)} in your active pipeline."
        if unclear:
            return f"More than one {next(iter(unclear))} could be meant. Tick the right one in the list."
        return found
    return context.selected or PICK_FIRST


async def _draft_outreach(
    session: AsyncSession,
    recruiter: User,
    row_id: uuid.UUID,
    intent: AssistantIntent,
    request: AssistantRequest,
    context: Context,
    keep: AssistantContext,
    provider: AIProvider,
    email: EmailProvider,
    calendar: CalendarProvider,
) -> Outcome:
    targets = await _targets(session, intent, context)
    if isinstance(targets, str):
        return Outcome(reply=targets, context=keep)
    details = intent.schedule
    if details is not None and times.resolve_day(details.timeframe, _today(request)) is None:
        details = None  # no day said: invitations that ask for times, not times nobody chose
    invitation = intent.interview is not None or details is not None or "interview" in request.text.lower()
    return await _propose_outreach(
        session, recruiter, row_id, targets, invitation, request, details, keep, provider, email, calendar
    )


async def _schedule(
    session: AsyncSession,
    recruiter: User,
    row_id: uuid.UUID,
    intent: AssistantIntent,
    request: AssistantRequest,
    context: Context,
    keep: AssistantContext,
    provider: AIProvider,
    email: EmailProvider,
    calendar: CalendarProvider,
) -> Outcome:
    details = intent.schedule or ScheduleDetails(**(intent.interview or InterviewDetails()).model_dump())
    if times.resolve_day(details.timeframe, _today(request)) is None:
        return Outcome(
            reply='Which day should I propose? For example "next Tuesday between 1 and 4 PM".',
            context=keep.model_copy(update={"action_id": context.proposal.id if context.proposal else None}),
        )
    if context.proposal is not None and context.proposal_kind == "outreach":
        payload = dict(context.proposal.payload or {})
        ids = [uuid.UUID(value) for value in payload.get("application_ids", [])]
        previous = OutreachCard.model_validate(payload["card"])
        if previous.schedule is not None and not details.interview_type:
            details = details.model_copy(update={"interview_type": previous.schedule.title})
        return await _propose_outreach(
            session,
            recruiter,
            context.proposal.id,
            ids,
            True,
            request,
            details,
            keep,
            provider,
            email,
            calendar,
            instructions=payload.get("instructions"),
            existing=context.proposal,
        )
    if not context.selected:
        return Outcome(reply=PICK_FIRST, context=keep)
    return await _propose_outreach(
        session, recruiter, row_id, context.selected, True, request, details, keep, provider, email, calendar
    )


async def _propose_outreach(
    session: AsyncSession,
    recruiter: User,
    action_id: uuid.UUID,
    targets: list[uuid.UUID],
    invitation: bool,
    request: AssistantRequest,
    details: ScheduleDetails | None,
    keep: AssistantContext,
    provider: AIProvider,
    email: EmailProvider,
    calendar: CalendarProvider,
    *,
    instructions: str | None = None,
    existing: AssistantAction | None = None,
) -> Outcome:
    applications = await outreach.applications_for(session, targets)
    words = instructions if instructions is not None else request.text
    card = await outreach.propose(
        session,
        recruiter,
        action_id,
        applications,
        invitation=invitation,
        instructions=words,
        details=details,
        utc_offset_minutes=request.utc_offset_minutes,
        provider=provider,
        email=email,
        calendar=calendar,
        now=utcnow(),
    )
    payload = {
        "kind": "outreach",
        "card": card.model_dump(mode="json"),
        "final": False,
        "instructions": words,
        "application_ids": [str(target) for target in targets],
    }
    keep = keep.model_copy(update={"action_id": action_id})
    names = _names([item.candidate.name for item in card.items])
    lines = [f"**{len(card.items)} personalized drafts**, one each for {names}. Nothing has been sent."]
    if card.schedule is not None:
        lines.append(_times(card, request.utc_offset_minutes))
        if not card.schedule.calendar_configured:
            lines.append(card.schedule.calendar_note)
    lines.append("Review each one, edit what you like, untick anyone to leave out, then approve.")
    reply = " ".join(lines)
    if existing is not None:
        await _save_payload(session, existing.id, {**(existing.payload or {}), **payload})
        return Outcome(reply=reply, cards=[card], context=keep)
    return Outcome(
        reply=reply,
        status=S.PROPOSED,
        cards=[card],
        context=keep,
        target_type="outreach",
        target_label=f"{len(card.items)} candidate{'s' if len(card.items) != 1 else ''}",
        payload=payload,
    )


def _times(card: OutreachCard, utc_offset_minutes: int) -> str:
    assert card.schedule is not None
    proposed = [(item.candidate.name, item.slot) for item in card.items if item.slot is not None]
    if not proposed:
        return "The window had no room for these interviews, so the drafts ask for times instead."
    first = times.describe(proposed[0][1], utc_offset_minutes)  # type: ignore[arg-type]
    text = (
        f"I proposed {len(proposed)} {card.schedule.duration_minutes}-minute {card.schedule.title.lower()}s back to back "
        f"from {first}, and each draft names its time."
    )
    if card.schedule.unscheduled:
        text += f" {card.schedule.unscheduled} didn't fit in the window; their drafts ask for times."
    return text


# Confirmation


async def confirm(
    session: AsyncSession,
    recruiter: User,
    action_id: uuid.UUID,
    edits: ConfirmActionRequest | str | None,
    email: EmailProvider,
    calendar: CalendarProvider | None = None,
) -> AssistantResponse:
    """Run a proposal, once. A second confirmation of the same proposal is a 409, never a second send.
    A failure is reported as one: nothing claims success unless the service it ran succeeded."""
    calendar = calendar or DisabledCalendar()
    request = edits if isinstance(edits, ConfirmActionRequest) else ConfirmActionRequest(body=edits)
    row = await _own(session, recruiter, action_id)
    claimed = await session.execute(
        update(AssistantAction)
        .where(
            AssistantAction.id == action_id,
            AssistantAction.recruiter_id == recruiter.id,
            AssistantAction.status == S.PROPOSED,
        )
        .values(status=S.EXECUTING, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if not claimed.rowcount:  # type: ignore[attr-defined]
        await session.rollback()
        row = await _reload(session, action_id)
        raise ConflictError(_already(row), code="action_already_handled")
    await session.commit()

    row = await _reload(session, action_id)
    payload, label = dict(row.payload or {}), row.target_label or ""
    kind = payload.get("kind", "message")
    result_context = AssistantContext(application_id=row.target_id if row.target_type == "application" else None)
    created: tuple[str, uuid.UUID, str] | None = None  # the job made, which becomes the action's target
    card: AssistantCard
    try:
        if kind == "message":
            message = MessageCard.model_validate(payload["card"])
            body = request.body
            if payload.get("draft_id"):
                sent = (
                    await drafts.send_draft(
                        session, uuid.UUID(payload["draft_id"]), None, body or message.body, recruiter, email
                    )
                ).message
            else:
                sent = await message_service.send_message(
                    session,
                    message.candidate.application_id,
                    body or message.body,
                    recruiter,
                    email,
                    subject=payload.get("subject"),
                )
            summary = f"Sent {message.purpose.lower()} to {message.candidate.name}"
            card = message.model_copy(update={"status": S.COMPLETED, "mode": "execute", "body": sent.content})
            payload["message_id"] = str(sent.id)
            reply = f"Sent to **{message.candidate.name}**. {delivered(sent)}"
            status: AssistantActionStatus = S.COMPLETED
        elif kind == "job":
            draft_card = JobDraftCard.model_validate(payload["card"])
            draft = request.job or draft_card.draft
            job = await jobs.create(session, draft)
            card = draft_card.model_copy(
                update={
                    "status": S.COMPLETED,
                    "stage": "created",
                    "draft": draft,
                    "missing": [],
                    "changes": [],
                    "job_id": job.id,
                    "job_href": f"/recruiter/jobs/{job.id}",
                    "careers_href": f"/careers/{job.id}",
                }
            )
            created = ("job", job.id, job.title)
            summary = f"Created the {job.title} job"
            reply = (
                f"Created **{job.title}**. It's open on your careers site now, and you can find its applicants here."
            )
            result_context = AssistantContext(job_id=job.id)
            status = S.COMPLETED
        elif kind == "outreach":
            outreach_card = OutreachCard.model_validate(payload["card"])
            card, reply, summary, status = await outreach.execute(
                session, recruiter, outreach_card, request, email, calendar
            )
        else:
            raise ConflictError("This action can't be confirmed.", code="not_confirmable")
        error = None if status == S.COMPLETED else reply
    except AppError as exc:
        await session.rollback()
        status, error, reply = S.FAILED, exc.message, exc.message
        summary, card = _failed(payload, label), _failed_card(payload, exc.message)
    except Exception:
        await session.rollback()
        logger.exception("assistant.confirm_failed action=%s", action_id)
        error = "Something went wrong while doing this. Check before trying again."
        status, reply = S.FAILED, error
        summary, card = _failed(payload, label), _failed_card(payload, error)

    row = await _reload(session, action_id)
    if created is not None:
        row.target_type, row.target_id, row.target_label = created
    now = utcnow()
    response = AssistantResponse(
        id=row.id,
        input_type=row.input_type,
        transcript=row.input_text,
        intent=row.intent,
        status=status,
        reply=reply,
        cards=[card],
        context=result_context,
        model_name="",
    )
    row.status, row.error, row.result_summary, row.executed_at, row.updated_at = status, error, summary, now, now
    row.payload = {**payload, "result": response.model_dump(mode="json")}
    await session.commit()
    return response


async def cancel(session: AsyncSession, recruiter: User, action_id: uuid.UUID) -> None:
    await _own(session, recruiter, action_id)
    result = await session.execute(
        update(AssistantAction)
        .where(AssistantAction.id == action_id, AssistantAction.status == S.PROPOSED)
        .values(status=S.CANCELLED, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if not result.rowcount:  # type: ignore[attr-defined]
        await session.rollback()
        raise ConflictError(_already(await _reload(session, action_id)), code="action_already_handled")
    await session.commit()
    payload = (await _reload(session, action_id)).payload or {}
    draft_ids = [payload["draft_id"]] if payload.get("draft_id") else []
    if payload.get("kind") == "outreach":
        draft_ids = [item["draft_id"] for item in payload["card"]["items"]]
    for draft_id in draft_ids:
        try:
            await drafts.discard_draft(session, uuid.UUID(draft_id))
        except AppError:
            await session.rollback()  # already sent or discarded elsewhere


def _already(row: AssistantAction) -> str:
    return {
        S.COMPLETED: "This was already done.",
        S.EXECUTING: "This is already being done.",
        S.FAILED: "This already failed. Ask again to start over.",
        S.CANCELLED: "This was cancelled.",
    }.get(row.status, "This can't be confirmed.")


def _failed(payload: dict[str, Any], label: str) -> str:
    kind = payload.get("kind", "message")
    if kind == "job":
        return f"Couldn't create the {label} job"
    if kind == "outreach":
        return f"Couldn't send outreach to {label}"
    return f"Couldn't send message to {label}"


def _failed_card(payload: dict[str, Any], error: str) -> AssistantCard:
    kind = payload.get("kind", "message")
    if kind == "job":
        return JobDraftCard.model_validate({**payload["card"], "status": S.FAILED, "error": error})
    if kind == "outreach":
        return OutreachCard.model_validate({**payload["card"], "status": S.FAILED, "error": error})
    return MessageCard.model_validate({**payload["card"], "status": S.FAILED, "error": error})


# History


async def history(session: AsyncSession, recruiter: User, limit: int = 20) -> list[AssistantHistoryItem]:
    """What the assistant did for this recruiter: messages sent, jobs created, and anything that failed.
    Questions and drafts that changed nothing aren't listed."""
    rows = await session.scalars(
        select(AssistantAction)
        .where(AssistantAction.recruiter_id == recruiter.id, AssistantAction.status.in_(HISTORY_STATUSES))
        .order_by(AssistantAction.executed_at.desc(), AssistantAction.created_at.desc())
        .limit(limit)
    )
    items = []
    for row in rows:
        href = None
        if row.target_type == "application" and row.target_id:
            href = f"/recruiter/candidates/{row.target_id}"  # the workspace opens candidates by application
        elif row.target_type == "job" and row.target_id:
            href = f"/recruiter/jobs/{row.target_id}"
        elif row.target_type == "outreach":
            href = "/recruiter/messages"
        items.append(
            AssistantHistoryItem(
                id=row.id,
                created_at=row.created_at,
                executed_at=row.executed_at,
                input_type=row.input_type,
                input_text=row.input_text,
                intent=row.intent,
                status=row.status,
                summary=row.result_summary or row.input_text,
                target_label=row.target_label,
                href=href,
            )
        )
    return items


# Internals


async def _context(session: AsyncSession, recruiter: User, context: AssistantContext) -> Context:
    application = await session.get(Application, context.application_id) if context.application_id else None
    if application is not None and application.archived_at is not None:
        application = None
    proposal = None
    if context.action_id:
        proposal = await session.get(AssistantAction, context.action_id)
        if proposal is None or proposal.recruiter_id != recruiter.id or proposal.status != S.PROPOSED:
            proposal = None
    if application is not None:
        await session.refresh(application, ["candidate", "job"])
    job = await session.get(Job, context.job_id) if context.job_id else None
    selected: list[uuid.UUID] = []
    if context.selected_application_ids:
        active = set(
            await session.scalars(
                select(Application.id).where(
                    Application.id.in_(context.selected_application_ids), Application.archived_at.is_(None)
                )
            )
        )
        selected = [item for item in dict.fromkeys(context.selected_application_ids) if item in active]
    return Context(application=application, proposal=proposal, job=job, search=context.search, selected=selected)


async def _save_payload(session: AsyncSession, action_id: uuid.UUID, payload: dict[str, Any]) -> None:
    await session.execute(
        update(AssistantAction)
        .where(AssistantAction.id == action_id)
        .values(payload=payload, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    await session.commit()


def _today(request: AssistantRequest):  # type: ignore[no-untyped-def]
    """The recruiter's today, in their own time zone."""
    return (utcnow() + timedelta(minutes=request.utc_offset_minutes)).date()


def _names(names: list[str]) -> str:
    if not names:
        return "nobody"
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _without_none(context: AssistantContext) -> dict[str, Any]:
    return {key: value for key, value in context.model_dump().items() if value not in (None, [])}


async def _by_request(session: AsyncSession, recruiter: User, client_request_id: str) -> AssistantAction | None:
    return await session.scalar(
        select(AssistantAction).where(
            AssistantAction.recruiter_id == recruiter.id, AssistantAction.client_request_id == client_request_id
        )
    )


def _replay(row: AssistantAction) -> AssistantResponse:
    """The first answer to a repeated request: nothing runs again."""
    response = (row.payload or {}).get("response")
    if row.status == S.PROCESSING or not response:
        raise ConflictError("Still working on that request.", code="request_in_progress")
    return AssistantResponse.model_validate(response)


async def _own(session: AsyncSession, recruiter: User, action_id: uuid.UUID) -> AssistantAction:
    row = await session.get(AssistantAction, action_id)
    if row is None or row.recruiter_id != recruiter.id:
        raise NotFoundError("That action doesn't exist.", code="action_not_found")
    return row


async def _reload(session: AsyncSession, action_id: uuid.UUID) -> AssistantAction:
    row = await session.get(AssistantAction, action_id, populate_existing=True)
    assert row is not None
    return row


__all__ = ["CandidateBrief", "cancel", "confirm", "handle", "history"]
