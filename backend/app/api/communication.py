"""Candidate communication: what needs attention, each application's communication health, and the
SLA rules behind them."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import AIProviderDep, EmailProviderDep, RecruiterDep, SessionDep
from app.core.enums import CommunicationRuleKey
from app.schemas.communication import (
    AttentionList,
    CommunicationHealthRead,
    CommunicationRuleRead,
    CommunicationRuleUpdate,
    DraftCreate,
    DraftRead,
    DraftSend,
    DraftSent,
    DraftUpdate,
    EmailDeliveryRead,
)
from app.services.communication import drafts, service

router = APIRouter(tags=["communication"])


@router.get("/communication/attention", response_model=AttentionList, summary="Candidates who need an update")
async def attention(session: SessionDep) -> AttentionList:
    """Applications in the active pipeline where an SLA rule's threshold has passed, longest overdue first."""
    return await service.attention_list(session)


@router.get(
    "/applications/{application_id}/communication",
    response_model=CommunicationHealthRead,
    summary="An application's communication health",
)
async def application_communication(application_id: UUID, session: SessionDep) -> CommunicationHealthRead:
    return await service.application_health(session, application_id)


@router.get("/communication/email", response_model=EmailDeliveryRead, summary="Email delivery status")
async def email_delivery(email: EmailProviderDep) -> EmailDeliveryRead:
    if not email.configured:
        return EmailDeliveryRead(configured=False)
    return EmailDeliveryRead(configured=True, provider=email.name, sender=email.sender)


@router.get("/communication/rules", response_model=list[CommunicationRuleRead], summary="SLA rules")
async def list_rules(session: SessionDep) -> list[CommunicationRuleRead]:
    return await service.list_rules(session)


@router.put("/communication/rules/{key}", response_model=CommunicationRuleRead, summary="Change an SLA rule")
async def update_rule(
    key: CommunicationRuleKey, body: CommunicationRuleUpdate, session: SessionDep, user: RecruiterDep
) -> CommunicationRuleRead:
    return await service.update_rule(session, key, body.enabled, body.threshold_hours, user)


# Drafts: the AI writes, the recruiter edits and approves. Nothing is sent without that approval.


@router.post("/communication/drafts", response_model=DraftRead, status_code=201, summary="Draft an update")
async def create_draft(
    body: DraftCreate, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> DraftRead:
    """An AI draft for one application, written for the rule that needs attention (or the reason
    given). It replaces the application's previous open draft. Nothing is sent."""
    reason = body.reason.value if isinstance(body.reason, CommunicationRuleKey) else body.reason
    return await drafts.create_draft(session, body.application_id, reason, body.instructions, provider, user)


@router.get("/communication/drafts", response_model=list[DraftRead], summary="Open drafts")
async def list_drafts(session: SessionDep, application_id: UUID | None = None) -> list[DraftRead]:
    return await service.open_drafts(session, [application_id] if application_id else None)


@router.patch("/communication/drafts/{draft_id}", response_model=DraftRead, summary="Edit a draft")
async def edit_draft(draft_id: UUID, body: DraftUpdate, session: SessionDep) -> DraftRead:
    return await drafts.edit_draft(session, draft_id, body.subject, body.body)


@router.post("/communication/drafts/{draft_id}/send", response_model=DraftSent, summary="Approve and send a draft")
async def send_draft(
    draft_id: UUID, session: SessionDep, user: RecruiterDep, email: EmailProviderDep, body: DraftSend | None = None
) -> DraftSent:
    """Sends it once, with any last edits: to the candidate portal, and by email when configured. 409
    draft_already_handled if it was already sent or discarded."""
    return await drafts.send_draft(
        session, draft_id, body.subject if body else None, body.body if body else None, user, email
    )


@router.post("/communication/drafts/{draft_id}/discard", response_model=DraftRead, summary="Discard a draft")
async def discard_draft(draft_id: UUID, session: SessionDep) -> DraftRead:
    return await drafts.discard_draft(session, draft_id)
