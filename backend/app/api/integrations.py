"""Ashby integration endpoints. The rest of Talent Bridge works without Ashby connected."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request

from app.core.config import settings
from app.core.dependencies import (
    AIProviderDep,
    AshbyClientDep,
    SessionDep,
    SessionFactoryDep,
    SupabaseAdminDep,
    require_recruiter,
)
from app.core.errors import ServiceUnavailableError
from app.integrations.ashby.status import ashby_status
from app.integrations.ashby.sync import RESOURCES, sync_from_settings
from app.integrations.ashby.webhook import WebhookProcessor
from app.schemas.integration import AshbyStatus, SyncReport, WebhookAck
from app.services import account_provisioning, ai_service

router = APIRouter(prefix="/integrations/ashby", tags=["integrations"])


@router.get("/status", response_model=AshbyStatus, dependencies=[Depends(require_recruiter)], summary="Ashby status")
async def status(session: SessionDep, client: AshbyClientDep, check: bool = False) -> AshbyStatus:
    """Connected, disconnected or error, with the last webhook, last successful sync and the latest
    error. check=true also calls Ashby to prove the API key works."""
    return await ashby_status(session, client, check=check)


@router.post(
    "/sync",
    response_model=SyncReport,
    dependencies=[Depends(require_recruiter)],
    summary="Reconcile with Ashby",
)
async def sync(
    factory: SessionFactoryDep, client: AshbyClientDep, admin: SupabaseAdminDep, full: bool = False
) -> SyncReport:
    """Pulls jobs, candidates, applications and interviews changed since the last sync (everything
    with full=true) and upserts them without duplicates. 503 until ASHBY_API_KEY is set."""
    if client is None:
        raise ServiceUnavailableError("Ashby isn't connected. Set ASHBY_API_KEY to sync.", code="ashby_not_configured")
    return await sync_from_settings(factory, client, admin).run(RESOURCES, full=full)


# No sign-in: Ashby calls this, and it is verified by Ashby's signature instead.
@router.post("/webhook", response_model=WebhookAck, summary="Ashby webhook receiver")
async def webhook(
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
    factory: SessionFactoryDep,
    client: AshbyClientDep,
    admin: SupabaseAdminDep,
    provider: AIProviderDep,
    ashby_signature: Annotated[str | None, Header(alias="Ashby-Signature")] = None,
) -> WebhookAck:
    """401 for a missing or wrong signature, 503 until ASHBY_WEBHOOK_SECRET is set. Portal
    invitations and AI analysis run after the response, so neither can fail the import."""
    secret = settings.ashby_webhook_secret
    processor = WebhookProcessor(
        session,
        secret=secret.get_secret_value() if secret else None,
        client=client,
        title_map=settings.ashby_stage_title_map,
        invites_enabled=settings.portal_invites_enabled,
        auto_analyze=settings.ashby_auto_analyze,
    )
    ack, follow_ups = await processor.handle(await request.body(), ashby_signature)
    if follow_ups.invite_candidate_ids:
        background.add_task(
            account_provisioning.provision_in_background, factory, sorted(follow_ups.invite_candidate_ids), admin
        )
    for application_id in sorted(follow_ups.analyze_application_ids):
        background.add_task(ai_service.analyze_in_background, factory, application_id, provider)
    return ack
