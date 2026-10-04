"""Integration health for recruiters: is Ashby connected, when did it last deliver, what went wrong.

Messages here come from AshbyError and the importer, which never include keys, tokens or payloads.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import PortalAccountStatus, WebhookEventStatus
from app.integrations.ashby.client import AshbyClient, AshbyError
from app.models import AshbySyncState, AshbyWebhookEvent, Candidate
from app.models.base import utcnow
from app.schemas.integration import AshbyStatus, ConnectionState, SyncResourceState

RECENT = timedelta(days=7)


async def ashby_status(session: AsyncSession, client: AshbyClient | None, *, check: bool = False) -> AshbyStatus:
    """check=True also calls Ashby (apiKey.info) to prove the key works."""
    now = utcnow()
    latest = (
        await session.execute(
            select(AshbyWebhookEvent.received_at, AshbyWebhookEvent.action)
            .order_by(AshbyWebhookEvent.received_at.desc())
            .limit(1)
        )
    ).first()
    failed_event = (
        await session.execute(
            select(AshbyWebhookEvent.error_message, AshbyWebhookEvent.received_at)
            .where(AshbyWebhookEvent.status == WebhookEventStatus.FAILED, AshbyWebhookEvent.received_at >= now - RECENT)
            .order_by(AshbyWebhookEvent.received_at.desc())
        )
    ).all()
    states = (await session.scalars(select(AshbySyncState).order_by(AshbySyncState.resource))).all()
    invitations = dict(
        (
            await session.execute(
                select(Candidate.portal_status, func.count())
                .where(Candidate.portal_status.in_([PortalAccountStatus.PENDING_INVITATION, PortalAccountStatus.INVITE_FAILED]))
                .group_by(Candidate.portal_status)
            )
        ).all()
    )

    last_success = max((state.last_success_at for state in states if state.last_success_at), default=None)
    # Errors still standing: a resource whose last error is newer than its last success, or a
    # webhook that failed in the last week.
    errors = [
        (state.last_error_at, f"Sync of {state.resource}: {state.last_error}")
        for state in states
        if state.last_error and state.last_error_at and (not state.last_success_at or state.last_error_at > state.last_success_at)
    ]
    errors += [(at, f"Webhook: {message}") for message, at in failed_event if message]
    if check and client is not None:
        try:
            await client.api_key_info()
        except AshbyError as exc:
            errors.append((now, str(exc)))
    error_at, error = max(errors, key=lambda item: item[0]) if errors else (None, None)

    connection: ConnectionState
    if client is None and not settings.ashby_webhook_secret:
        connection = "disconnected"
    elif errors:
        connection = "error"
    else:
        connection = "connected"

    return AshbyStatus(
        status=connection,
        api_key_configured=client is not None,
        webhook_secret_configured=bool(settings.ashby_webhook_secret),
        portal_invites_configured=bool(settings.supabase_url and settings.supabase_secret_key),
        last_webhook_at=latest.received_at if latest else None,
        last_webhook_action=latest.action if latest else None,
        webhooks_failed_last_7_days=len(failed_event),
        last_successful_sync_at=last_success,
        last_error=error,
        last_error_at=error_at,
        resources=[
            SyncResourceState(
                resource=state.resource,
                last_success_at=state.last_success_at,
                last_error=state.last_error,
                last_error_at=state.last_error_at,
            )
            for state in states
        ],
        invitations_pending=invitations.get(PortalAccountStatus.PENDING_INVITATION, 0),
        invitations_failed=invitations.get(PortalAccountStatus.INVITE_FAILED, 0),
    )
