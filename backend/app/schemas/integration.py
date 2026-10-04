"""Ashby integration responses. None of them carries a key, token, secret or payload."""

from typing import Literal

from app.schemas.common import APIModel, Timestamp

WebhookResult = Literal["ok", "processed", "duplicate", "in_progress", "ignored", "failed"]
ConnectionState = Literal["connected", "disconnected", "error"]


class WebhookAck(APIModel):
    """What the webhook receiver tells Ashby. Any 2xx counts as delivered."""

    status: WebhookResult
    action: str
    detail: str | None = None


class SyncResourceReport(APIModel):
    resource: str
    full_sync: bool
    fetched: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    error: str | None = None
    problems: list[str] = []  # the first few records that couldn't be imported, and why


class SyncReport(APIModel):
    resources: list[SyncResourceReport]
    invitations: dict[str, int] = {}


class SyncResourceState(APIModel):
    resource: str
    last_success_at: Timestamp | None = None
    last_error: str | None = None
    last_error_at: Timestamp | None = None


class AshbyStatus(APIModel):
    """GET /integrations/ashby/status: whether Ashby is connected and how syncing is going."""

    status: ConnectionState
    api_key_configured: bool
    webhook_secret_configured: bool
    portal_invites_configured: bool
    last_webhook_at: Timestamp | None = None
    last_webhook_action: str | None = None
    webhooks_failed_last_7_days: int = 0
    last_successful_sync_at: Timestamp | None = None
    last_error: str | None = None
    last_error_at: Timestamp | None = None
    resources: list[SyncResourceState] = []
    invitations_pending: int = 0
    invitations_failed: int = 0
