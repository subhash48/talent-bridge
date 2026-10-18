"""Candidate communication: what needs attention, each application's communication health, and the
SLA rules behind them."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import RecruiterDep, SessionDep
from app.core.enums import CommunicationRuleKey
from app.schemas.communication import (
    AttentionList,
    CommunicationHealthRead,
    CommunicationRuleRead,
    CommunicationRuleUpdate,
)
from app.services.communication import service

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


@router.get("/communication/rules", response_model=list[CommunicationRuleRead], summary="SLA rules")
async def list_rules(session: SessionDep) -> list[CommunicationRuleRead]:
    return await service.list_rules(session)


@router.put("/communication/rules/{key}", response_model=CommunicationRuleRead, summary="Change an SLA rule")
async def update_rule(
    key: CommunicationRuleKey, body: CommunicationRuleUpdate, session: SessionDep, user: RecruiterDep
) -> CommunicationRuleRead:
    return await service.update_rule(session, key, body.enabled, body.threshold_hours, user)
