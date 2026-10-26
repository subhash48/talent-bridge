"""AI drafts of candidate updates, for a recruiter to edit and approve.

Each draft is written for a reason: an SLA rule that needs attention (what the AI is told to cover
comes from the application's communication health), or "manual" when the recruiter asks. Nothing
here sends on its own. Sending a draft is the recruiter's approval: it goes through the one send path
(message_service.send_message) exactly once, so a double click can't send it twice. An application
has at most one open draft; writing a new one discards the old.
"""

import asyncio
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import MANUAL_DRAFT, ApplicationStage, CommunicationRuleKey, DraftStatus
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.integrations.email import EmailProvider
from app.models import Application, CommunicationDraft, User
from app.models.base import utcnow
from app.schemas.ai import DraftPurpose
from app.schemas.communication import DraftRead, DraftSent
from app.services import ai_service, message_service
from app.services.ai.client import AIProvider
from app.services.ai_service import with_fallback
from app.services.communication import rules as rule_store
from app.services.communication.health import Health, assess
from app.services.communication.present import candidate_status, draft_read
from app.services.pipeline_service import get_application, load_snapshots

K = CommunicationRuleKey
S = ApplicationStage


def brief(reason: str, health: Health, application: Application, now: datetime) -> tuple[DraftPurpose, str]:
    """What kind of message to draft for this reason, and what it should cover."""
    sees = candidate_status(application)
    if reason == K.STAGE_UPDATE:
        if application.stage == S.REJECTED:
            return DraftPurpose.STAGE_UPDATE, (
                "Let them know kindly that they're no longer under consideration for the role. Thank them for their "
                "time and wish them well. Never give a reason."
            )
        if application.stage == S.HIRED:
            return (
                DraftPurpose.STAGE_UPDATE,
                "Congratulate them on joining and say their onboarding details will follow.",
            )
        return DraftPurpose.STAGE_UPDATE, (
            f"Their application has moved forward: their portal now shows it as {sees}. Tell them what that means "
            "and what happens next."
        )
    if reason == K.UNANSWERED_QUESTION and health.open_question:
        return DraftPurpose.QUESTION_REPLY, f'Reply to their latest message: "{health.open_question.excerpt}"'
    if reason == K.POST_INTERVIEW and health.last_interview:
        return DraftPurpose.STATUS_UPDATE, (
            f"Thank them for the {health.last_interview.title} and tell them what happens next and when they can "
            "expect to hear back. Don't share feedback or a decision."
        )
    if reason == K.INTERVIEW_UNCONFIRMED and health.next_interview:
        return DraftPurpose.INTERVIEW_CONFIRMATION, (
            f"Remind them about the {health.next_interview.title} and ask them to confirm it in their candidate portal."
        )
    if reason == K.NO_RECENT_UPDATE:
        days = health.days_since_update(now)
        return DraftPurpose.STATUS_UPDATE, (
            f"They haven't had an update for {days} days. Tell them where their application stands (their portal "
            f"shows {sees}) and what happens next."
        )
    return DraftPurpose.FOLLOW_UP, ""


async def create_draft(
    session: AsyncSession,
    application_id: uuid.UUID,
    reason: str | None,
    instructions: str | None,
    provider: AIProvider,
    actor: User | None,
    now: datetime | None = None,
    *,
    can_reply: bool | None = None,
) -> DraftRead:
    """Draft an update. Without a reason: for the first rule needing attention, else a general one.
    can_reply: whether they'll be able to reply once it's sent (by default, whether their messaging is on)."""
    now = now or utcnow()
    application = await get_application(session, application_id)
    if application.archived_at is not None:
        raise BadRequestError(
            f"Restore {application.candidate.first_name} to the pipeline before drafting an update.",
            code="application_archived",
        )
    [snapshot] = await load_snapshots(session, [application])
    health = assess(snapshot, await rule_store.load_rules(session), now)
    if reason is None:
        reason = health.attention[0].rule.value if health.attention else MANUAL_DRAFT
    if reason == MANUAL_DRAFT and instructions:
        # The recruiter said what it should say: a message that says exactly that.
        purpose, text = DraftPurpose.CUSTOM, instructions
    else:
        purpose, guidance = brief(reason, health, application, now)
        note = f" The recruiter adds: {instructions}" if instructions else ""
        text = f"{guidance}{note}".strip()
    written = await ai_service.draft_message(
        session, application.id, purpose, text or None, provider, actor, can_reply=can_reply
    )

    await session.execute(
        update(CommunicationDraft)
        .where(CommunicationDraft.application_id == application.id, CommunicationDraft.status == DraftStatus.DRAFTED)
        .values(status=DraftStatus.DISCARDED, discarded_at=now, updated_at=now)
    )
    draft = CommunicationDraft(
        application_id=application.id,
        reason=reason,
        status=DraftStatus.DRAFTED,
        subject=written.subject,
        body=written.body,
        ai_subject=written.subject,
        ai_body=written.body,
        model_name=written.model_name,
        created_by=actor.id if actor else None,
        created_at=now,
        updated_at=now,
    )
    session.add(draft)
    await session.commit()
    return draft_read(draft)


async def create_personal_drafts(
    session: AsyncSession,
    applications: Sequence[Application],
    briefs: Mapping[uuid.UUID, tuple[DraftPurpose, str | None]],
    provider: AIProvider,
    actor: User | None,
    now: datetime | None = None,
    *,
    can_reply: bool | None = None,
) -> list[CommunicationDraft]:
    """One draft per application, each written for that candidate from their own record: never one
    message for everyone. briefs gives each application what to write (the purpose, and what to say). The
    AI writes them side by side; like any draft they wait for the recruiter, and each replaces that
    application's open draft. Returned in the order given."""
    now = now or utcnow()
    for application in applications:
        if application.archived_at is not None:
            raise BadRequestError(
                f"Restore {application.candidate.first_name} to the pipeline before drafting to them.",
                code="application_archived",
            )
    contexts = [
        await ai_service.candidate_context(session, application.id, actor, can_reply=can_reply)
        for application in applications
    ]
    asks = [briefs[application.id] for application in applications]
    written = await asyncio.gather(
        *(
            with_fallback(provider, lambda p, c=context, k=purpose, i=note: p.draft_message(c, k, i))
            for context, (purpose, note) in zip(contexts, asks, strict=True)
        )
    )
    ids = [application.id for application in applications]
    await session.execute(
        update(CommunicationDraft)
        .where(CommunicationDraft.application_id.in_(ids), CommunicationDraft.status == DraftStatus.DRAFTED)
        .values(status=DraftStatus.DISCARDED, discarded_at=now, updated_at=now)
    )
    drafts = [
        CommunicationDraft(
            application_id=application.id,
            reason=MANUAL_DRAFT,
            status=DraftStatus.DRAFTED,
            subject=content.subject,
            body=content.body,
            ai_subject=content.subject,
            ai_body=content.body,
            model_name=model_name,
            created_by=actor.id if actor else None,
            created_at=now,
            updated_at=now,
        )
        for application, (content, model_name) in zip(applications, written, strict=True)
    ]
    session.add_all(drafts)
    await session.commit()
    return drafts


async def is_open(session: AsyncSession, draft_id: uuid.UUID) -> bool:
    """Whether the draft is still waiting to be sent: not sent, discarded or replaced by a newer one."""
    status = await session.scalar(select(CommunicationDraft.status).where(CommunicationDraft.id == draft_id))
    return status == DraftStatus.DRAFTED


async def _open(session: AsyncSession, draft_id: uuid.UUID) -> CommunicationDraft:
    draft = await session.get(CommunicationDraft, draft_id)
    if draft is None:
        raise NotFoundError("Draft not found.")
    if draft.status != DraftStatus.DRAFTED:
        raise ConflictError(f"This draft was already {draft.status.value}.", code="draft_already_handled")
    return draft


async def edit_draft(session: AsyncSession, draft_id: uuid.UUID, subject: str, body: str) -> DraftRead:
    draft = await _open(session, draft_id)
    draft.subject, draft.body = subject, body
    await session.commit()
    return draft_read(draft)


async def discard_draft(session: AsyncSession, draft_id: uuid.UUID) -> DraftRead:
    draft = await _open(session, draft_id)
    now = utcnow()
    draft.status, draft.discarded_at = DraftStatus.DISCARDED, now
    await session.commit()
    return draft_read(draft)


async def send_draft(
    session: AsyncSession,
    draft_id: uuid.UUID,
    subject: str | None,
    body: str | None,
    actor: User | None,
    email: EmailProvider,
) -> DraftSent:
    """The recruiter approved it: send it, once, with any last edits."""
    draft = await _open(session, draft_id)
    now = utcnow()
    final_subject, final_body = subject or draft.subject, body or draft.body
    claimed = await session.execute(
        update(CommunicationDraft)
        .where(CommunicationDraft.id == draft_id, CommunicationDraft.status == DraftStatus.DRAFTED)
        .values(status=DraftStatus.SENT, subject=final_subject, body=final_body, sent_at=now, updated_at=now)
        .execution_options(synchronize_session=False)
    )
    if not claimed.rowcount:  # type: ignore[attr-defined]
        await session.rollback()
        raise ConflictError("This draft was already sent or discarded.", code="draft_already_handled")
    # The claim commits with the message, so a refused send (an archived candidate) leaves it a draft.
    message = await message_service.send_message(
        session, draft.application_id, final_body, actor, email, subject=final_subject, draft_id=draft.id
    )
    draft = await session.get(CommunicationDraft, draft_id, populate_existing=True)
    assert draft is not None
    draft.message_id = message.id
    await session.commit()
    return DraftSent(draft=draft_read(draft), message=message)
