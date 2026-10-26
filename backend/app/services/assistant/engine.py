"""The recruiter assistant's action engine. Typed and spoken requests take exactly the same path:

    words (typed, or a transcript) -> one structured action (understand.py)
    -> policy checks -> who it's about (resolve.py) -> a plan:
       a question is answered (who needs an update, unanswered messages, interviews to confirm or
       follow up on, one candidate's status); a message becomes a proposal
    -> the recruiter confirms a proposal (confirm()) -> the existing service sends it, once.

Every request is recorded (assistant_actions): the words, the structured action, the target and the
result. A repeated request (same client_request_id) returns the first one's answer instead of doing
anything twice, and a proposal's status moves on exactly once, so one confirmation is one send.

What runs is always an existing TalentBridge service: communication drafts (an update written for
the rule that needs attention, sent through the one send path: candidate portal, timeline and email
when configured), message_service for interview invitations, the communication health behind Today
and candidate_service.list_pipeline. Nothing here decides anything about a candidate: it never ranks,
scores, advances or rejects anyone.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import MANUAL_DRAFT, AssistantActionStatus, EmailStatus
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.email import EmailProvider
from app.models import Application, AssistantAction, User
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
    InterviewDetails,
    MessageCard,
)
from app.schemas.message import MessageRead
from app.services import ai_service, message_service
from app.services.ai.client import AIProvider
from app.services.assistant import answers
from app.services.assistant.resolve import Resolution, resolve_candidate
from app.services.assistant.understand import policy_refusal, understand
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

    def describe(self) -> str:
        lines = []
        if self.application is not None:
            lines.append(f"Candidate in focus: {self.application.candidate.full_name}, {self.application.job.title}")
        if self.proposal is not None:
            lines.append(f"Waiting for confirmation: {self.proposal.target_label} ({self.proposal.intent})")
        return "\n".join(lines)


# Requests


async def handle(
    session: AsyncSession, recruiter: User, request: AssistantRequest, provider: AIProvider
) -> AssistantResponse:
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
    intent, model_name = await understand(
        request.text,
        context.describe(),
        provider,
        proposal_in_context=context.proposal is not None,
    )
    try:
        outcome = await _plan(session, recruiter, row_id, intent, request, context, provider)
    except AppError as exc:
        await session.rollback()
        outcome = Outcome(reply=exc.message)
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
) -> Outcome:
    resolution = await resolve_candidate(
        session,
        name=intent.candidate_name,
        text=request.text,
        job_title=intent.job_title,
        context_application_id=request.context.application_id,
    )
    refusal = policy_refusal(request.text, intent, names_a_person=bool(resolution.matches))
    keep = AssistantContext(application_id=context.application.id if context.application else None)
    if refusal:
        return Outcome(reply=refusal, context=keep)

    action = intent.action
    if action in ("send_interview_email", "draft_message"):
        return await _propose_message(session, recruiter, row_id, intent, request, resolution, keep, provider)
    if action == "confirm":
        return await _escalate(context, keep)
    if action == "cancel":
        return await _cancel_in_context(session, recruiter, context, keep)
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
    if action == "search_candidates":
        reply, list_card = await answers.search(session, intent)
        return Outcome(reply=reply, cards=[list_card] if list_card else [], context=keep)
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


async def _escalate(context: Context, keep: AssistantContext) -> Outcome:
    """ "Send it": the proposal in context, shown ready to confirm. Never sent by voice alone: a
    transcript can be wrong, so the click is the confirmation."""
    proposal = context.proposal
    if proposal is None:
        return Outcome(reply="There's nothing waiting to be confirmed.", context=keep)
    payload = proposal.payload or {}
    keep = keep.model_copy(update={"action_id": proposal.id})
    card = MessageCard.model_validate({**payload["card"], "mode": "execute"})
    return Outcome(reply=f"Ready to send to **{card.candidate.name}**. Confirm to send it.", cards=[card], context=keep)


async def _cancel_in_context(
    session: AsyncSession, recruiter: User, context: Context, keep: AssistantContext
) -> Outcome:
    if context.proposal is None:
        return Outcome(reply="There's nothing to cancel.", context=keep)
    await cancel(session, recruiter, context.proposal.id)
    return Outcome(reply="Cancelled. Nothing was sent.", context=keep.model_copy(update={"action_id": None}))


# Confirmation


async def confirm(
    session: AsyncSession, recruiter: User, action_id: uuid.UUID, body: str | None, email: EmailProvider
) -> AssistantResponse:
    """Run a proposal, once. A second confirmation of the same proposal is a 409, never a second send.
    A failure is reported as one: nothing claims success unless the service it ran succeeded."""
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
    card: AssistantCard
    try:
        if payload.get("kind") == "message":
            message = MessageCard.model_validate(payload["card"])
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
        else:
            raise ConflictError("This action can't be confirmed.", code="not_confirmable")
        status, error = S.COMPLETED, None
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
    now = utcnow()
    response = AssistantResponse(
        id=row.id,
        input_type=row.input_type,
        transcript=row.input_text,
        intent=row.intent,
        status=status,
        reply=reply,
        cards=[card],
        context=AssistantContext(application_id=row.target_id if row.target_type == "application" else None),
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
    draft_id = ((await _reload(session, action_id)).payload or {}).get("draft_id")
    if draft_id:
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
    return f"Couldn't send message to {label}"


def _failed_card(payload: dict[str, Any], error: str) -> AssistantCard:
    return MessageCard.model_validate({**payload["card"], "status": S.FAILED, "error": error})


# History


async def history(session: AsyncSession, recruiter: User, limit: int = 20) -> list[AssistantHistoryItem]:
    """What the assistant did for this recruiter: messages sent, and anything that failed. Questions and
    drafts that changed nothing aren't listed."""
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
    return Context(application=application, proposal=proposal)


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
