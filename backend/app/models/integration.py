from datetime import datetime
from typing import Any

from sqlalchemy import Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import WebhookEventStatus
from app.models.base import Base, JSONType, UUIDPrimaryKey, text_enum, utcnow


class AshbyWebhookEvent(UUIDPrimaryKey, Base):
    """One Ashby webhook event, recorded before it is applied so a redelivery is applied once.

    event_key is "<webhookActionId>:<action>" (Ashby repeats the id across retries and across the
    related webhooks one change fires, so the action is part of the key), or a hash of the body when
    a payload has no id. The payload itself isn't kept: it holds personal data, and Ashby resends it
    on retry.
    """

    __tablename__ = "ashby_webhook_events"
    __table_args__ = (Index("ashby_webhook_events_received_idx", "received_at"),)

    event_key: Mapped[str] = mapped_column(Text, unique=True)
    action: Mapped[str] = mapped_column(Text)
    webhook_action_id: Mapped[str | None] = mapped_column(Text)
    external_entity_id: Mapped[str | None] = mapped_column(Text)
    payload_sha256: Mapped[str] = mapped_column(Text)
    status: Mapped[WebhookEventStatus] = mapped_column(
        text_enum(WebhookEventStatus), default=WebhookEventStatus.PROCESSING
    )
    attempts: Mapped[int] = mapped_column(default=1)
    error_message: Mapped[str | None] = mapped_column(Text)  # a safe summary, never the payload
    received_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    processed_at: Mapped[datetime | None]
    duration_ms: Mapped[int | None]


class AshbySyncState(Base):
    """Where the last reconciliation sync of one resource got to, and how it went."""

    __tablename__ = "ashby_sync_state"

    resource: Mapped[str] = mapped_column(Text, primary_key=True)  # jobs, candidates, applications, interviews
    sync_token: Mapped[str | None] = mapped_column(Text)  # Ashby's incremental sync token (valid 14 days)
    last_started_at: Mapped[datetime | None]
    last_success_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(Text)
    last_error_at: Mapped[datetime | None]
    last_result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, server_default=func.now())
