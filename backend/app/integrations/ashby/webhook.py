"""The Ashby webhook receiver: verify, record once, apply, acknowledge.

1. Verify Ashby-Signature: HMAC-SHA256 of the raw body with ASHBY_WEBHOOK_SECRET, compared in constant
   time. Missing or wrong: 401, which Ashby doesn't retry. User-Agent and payload fields prove nothing.
2. Record the event under "<webhookActionId>:<action>" (unique), committed before it is applied. A
   redelivery of a processed event is acknowledged without being applied again; one still being
   processed elsewhere is left alone until its lease runs out; a failed one is applied again.
3. Apply it with the importer in one transaction that also marks the event processed, so the data
   and the record of having applied it commit together.
4. Hand back follow-ups (portal invitations, AI analysis) to run after the response, outside that
   transaction: their failure never loses the import.

Errors Ashby should retry (the database, a record that depends on one not synced yet) answer 5xx;
Ashby retries with backoff up to 10 times, and the reconciliation sync repairs anything still missed.
"""

import hashlib
import hmac
import json
import logging
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import timedelta

from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import insert_if_absent
from app.core.enums import ApplicationStage, WebhookEventStatus
from app.core.errors import AppError, BadRequestError, ServiceUnavailableError, UnauthorizedError
from app.integrations.ashby.client import AshbyClient
from app.integrations.ashby.importer import AshbyImporter, NotReady, SkipRecord
from app.integrations.ashby.schemas import (
    AshbyApplication,
    AshbyJob,
    CandidateMerge,
    InterviewSchedule,
    WebhookEnvelope,
)
from app.models import AshbyWebhookEvent
from app.models.base import utcnow
from app.schemas.integration import WebhookAck

logger = logging.getLogger(__name__)

W = WebhookEventStatus
APPLICATION_ACTIONS = frozenset({"applicationSubmit", "applicationUpdate", "candidateStageChange", "candidateHire"})
SCHEDULE_ACTIONS = frozenset({"interviewScheduleCreate", "interviewScheduleUpdate"})
JOB_ACTIONS = frozenset({"jobCreate", "jobUpdate"})
MERGE_ACTION = "candidateMerge"
PROCESSING_LEASE = timedelta(minutes=5)


class WebhookFailed(AppError):
    """Applying the event failed in a way a redelivery may fix. Ashby retries 5xx."""

    status_code = 500
    code = "ashby_webhook_failed"


@dataclass
class FollowUps:
    """Work to run once the import has committed."""

    invite_candidate_ids: set[uuid.UUID] = field(default_factory=set)
    analyze_application_ids: set[uuid.UUID] = field(default_factory=set)


@dataclass
class _Applied:
    entity_id: str | None
    status: WebhookEventStatus = W.PROCESSED
    detail: str | None = None


Record = AshbyApplication | InterviewSchedule | AshbyJob | CandidateMerge


def parse_record(envelope: WebhookEnvelope) -> Record | None:
    """The typed record a webhook carries, or None for actions Talent Bridge doesn't use."""
    action, data = envelope.action, envelope.data
    if action in APPLICATION_ACTIONS:
        return AshbyApplication.model_validate(data["application"])
    if action in SCHEDULE_ACTIONS:
        return InterviewSchedule.model_validate(data["interviewSchedule"])
    if action in JOB_ACTIONS:
        return AshbyJob.model_validate(data["job"])
    if action == MERGE_ACTION:
        return CandidateMerge.model_validate(data)
    return None


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    """Ashby-Signature is "sha256=<hex digest>"; the digest is compared in constant time."""
    if not header:
        return False
    algorithm, _, digest = header.strip().partition("=")
    if algorithm.lower() != "sha256" or not digest:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest.strip().lower().encode(), expected.encode())


class WebhookProcessor:
    def __init__(
        self,
        session: AsyncSession,
        *,
        secret: str | None,
        client: AshbyClient | None = None,
        title_map: Mapping[str, ApplicationStage] | None = None,
        invites_enabled: bool = True,
        auto_analyze: bool = True,
    ) -> None:
        self.session = session
        self.secret = secret
        self.client = client
        self.title_map = title_map or {}
        self.invites_enabled = invites_enabled
        self.auto_analyze = auto_analyze

    async def handle(self, body: bytes, signature: str | None) -> tuple[WebhookAck, FollowUps]:
        if not self.secret:
            raise ServiceUnavailableError(
                "Ashby webhooks aren't configured: set ASHBY_WEBHOOK_SECRET.", code="ashby_not_configured"
            )
        if not verify_signature(self.secret, body, signature):
            logger.warning("ashby.webhook_rejected reason=%s", "missing_signature" if not signature else "bad_signature")
            raise UnauthorizedError("Invalid Ashby webhook signature.", code="invalid_signature")
        try:
            envelope = WebhookEnvelope.model_validate(json.loads(body))
        except (ValueError, ValidationError):
            raise BadRequestError("The webhook body isn't an Ashby webhook.", code="invalid_payload") from None

        if envelope.action == "ping":
            logger.info("ashby.webhook action=ping")
            return WebhookAck(status="ok", action="ping"), FollowUps()

        digest = hashlib.sha256(body).hexdigest()
        key = f"{envelope.webhook_action_id}:{envelope.action}" if envelope.webhook_action_id else f"sha256:{digest}"
        started = time.perf_counter()
        claimed = await self._claim(key, envelope, digest)
        if claimed is not None:
            return claimed, FollowUps()

        try:
            record = parse_record(envelope)
        except (ValidationError, KeyError, TypeError):
            await self._finish(key, W.FAILED, None, "The payload didn't match Ashby's documented shape.", started)
            # Redelivering the same body can't help, so it is acknowledged; the status endpoint shows it.
            return WebhookAck(status="failed", action=envelope.action, detail="unreadable payload"), FollowUps()

        follow_ups = FollowUps()
        try:
            applied = await self._apply(envelope.action, record, follow_ups)
        except SkipRecord as exc:
            await self.session.rollback()
            applied = _Applied(entity_id=None, status=W.IGNORED, detail=str(exc))
        except NotReady as exc:
            await self.session.rollback()
            await self._finish(key, W.FAILED, None, str(exc), started)
            raise ServiceUnavailableError(str(exc), code="ashby_not_ready") from None
        except Exception as exc:
            await self.session.rollback()
            logger.exception("ashby.webhook_error action=%s event=%s", envelope.action, key)
            await self._finish(key, W.FAILED, None, f"{exc.__class__.__name__} while applying the event.", started)
            raise WebhookFailed("The webhook couldn't be applied. Ashby will retry it.") from None

        await self._finish(key, applied.status, applied.entity_id, applied.detail, started)
        result = "processed" if applied.status == W.PROCESSED else "ignored"
        return WebhookAck(status=result, action=envelope.action, detail=applied.detail), follow_ups

    async def _claim(self, key: str, envelope: WebhookEnvelope, digest: str) -> WebhookAck | None:
        """Record the event. Returns an acknowledgement when it mustn't be applied (again) now."""
        now = utcnow()
        inserted = await insert_if_absent(
            self.session,
            AshbyWebhookEvent.__table__,
            {
                "id": uuid.uuid4(),
                "event_key": key,
                "action": envelope.action,
                "webhook_action_id": envelope.webhook_action_id,
                "payload_sha256": digest,
                "status": W.PROCESSING,
                "attempts": 1,
                "received_at": now,
            },
        )
        await self.session.commit()
        if inserted:
            return None

        event = await self.session.scalar(select(AshbyWebhookEvent).where(AshbyWebhookEvent.event_key == key))
        assert event is not None
        if event.status in (W.PROCESSED, W.IGNORED):
            logger.info("ashby.webhook action=%s event=%s result=duplicate", envelope.action, key)
            return WebhookAck(status="duplicate", action=envelope.action)
        # Failed before, or processing elsewhere for longer than the lease: take it over.
        stale = now - PROCESSING_LEASE
        retaken = await self.session.execute(
            update(AshbyWebhookEvent)
            .where(
                AshbyWebhookEvent.id == event.id,
                AshbyWebhookEvent.attempts == event.attempts,
                (AshbyWebhookEvent.status == W.FAILED) | (AshbyWebhookEvent.received_at < stale),
            )
            .values(status=W.PROCESSING, attempts=event.attempts + 1, received_at=now, error_message=None)
            .execution_options(synchronize_session=False)
        )
        await self.session.commit()
        if retaken.rowcount:  # type: ignore[attr-defined]
            return None
        logger.info("ashby.webhook action=%s event=%s result=in_progress", envelope.action, key)
        return WebhookAck(status="in_progress", action=envelope.action)

    async def _apply(self, action: str, record: Record | None, follow_ups: FollowUps) -> _Applied:
        importer = AshbyImporter(
            self.session, client=self.client, title_map=self.title_map, invites_enabled=self.invites_enabled
        )
        match record:
            case AshbyApplication():
                result = await importer.upsert_application(record, may_invite=True)
                if result.stale:
                    return _Applied(record.id, W.IGNORED, "Older than the version already applied.")
                if result.invite:
                    follow_ups.invite_candidate_ids.add(result.candidate_id)
                if result.created and action == "applicationSubmit" and self.auto_analyze:
                    follow_ups.analyze_application_ids.add(result.application_id)
                return _Applied(record.id)
            case InterviewSchedule():
                await importer.upsert_schedule(record)
                return _Applied(record.id)
            case AshbyJob():
                await importer.upsert_job(record)
                return _Applied(record.id)
            case CandidateMerge():
                detail = await importer.merge_candidates(record)
                return _Applied(record.merged_candidate.id, detail=detail)
            case None:
                return _Applied(None, W.IGNORED, f"Talent Bridge doesn't use {action} webhooks.")

    async def _finish(
        self,
        key: str,
        status: WebhookEventStatus,
        entity_id: str | None,
        detail: str | None,
        started: float,
    ) -> None:
        """Mark the event, committing the import with it."""
        duration_ms = round((time.perf_counter() - started) * 1000)
        await self.session.execute(
            update(AshbyWebhookEvent)
            .where(AshbyWebhookEvent.event_key == key)
            .values(
                status=status,
                external_entity_id=entity_id,
                error_message=detail if status != W.PROCESSED else None,
                processed_at=utcnow(),
                duration_ms=duration_ms,
            )
        )
        await self.session.commit()
        logger.info(
            "ashby.webhook event=%s entity=%s result=%s duration_ms=%d%s",
            key,
            entity_id,
            status,
            duration_ms,
            f" detail={detail!r}" if detail else "",
        )
