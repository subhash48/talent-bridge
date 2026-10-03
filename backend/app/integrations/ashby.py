"""Ashby ATS integration. Optional: the workspace runs entirely on its own database.

With ASHBY_API_KEY set, the sync methods pull Ashby's jobs, candidates and applications and
upsert them by external_id (applications by candidate and job), so local ids, stage history and
activity survive every sync. Webhooks are verified with ASHBY_WEBHOOK_SECRET.

Ashby's API is RPC-style: POST https://api.ashbyhq.com/<endpoint> with Basic auth (the API key as
the username), cursor pagination via nextCursor/moreDataAvailable. The field mappings below
follow Ashby's public API reference; check them against a live account before relying on them.
"""

import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType, ApplicationStage, JobStatus
from app.core.errors import AppError, BadRequestError, ServiceUnavailableError, UnauthorizedError
from app.models import Application, Candidate, CandidateStageHistory, Job
from app.models.base import utcnow
from app.services.activity_service import record_activity

logger = logging.getLogger(__name__)

BASE_URL = "https://api.ashbyhq.com"

JOB_STATUSES = {
    "Open": JobStatus.OPEN,
    "Draft": JobStatus.DRAFT,
    "Closed": JobStatus.CLOSED,
    "Archived": JobStatus.CLOSED,
}
# Ashby interview stage types to pipeline stages.
STAGE_TYPES = {
    "Lead": ApplicationStage.SOURCED,
    "PreInterviewScreen": ApplicationStage.SCREENING,
    "Active": ApplicationStage.INTERVIEW,
    "Offer": ApplicationStage.OFFER,
    "Hired": ApplicationStage.HIRED,
    "Archived": ApplicationStage.REJECTED,
}


class AshbyError(AppError):
    status_code = 502
    code = "ashby_error"


@dataclass
class SyncResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0


class AshbyClient:
    def __init__(
        self,
        api_key: str | None,
        webhook_secret: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._api_key = api_key
        self._webhook_secret = webhook_secret
        self._transport = transport
        self._timeout = timeout

    @classmethod
    def from_settings(cls) -> "AshbyClient":
        key, secret = settings.ashby_api_key, settings.ashby_webhook_secret
        return cls(key.get_secret_value() if key else None, secret.get_secret_value() if secret else None)

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def sync_jobs(self, session: AsyncSession) -> SyncResult:
        result = SyncResult()
        for item in await self._list("job.list"):
            job = await session.scalar(select(Job).where(Job.external_id == item["id"]))
            fields = {
                "title": item.get("title") or "Untitled role",
                "status": JOB_STATUSES.get(item.get("status", ""), JobStatus.DRAFT),
                "department": item.get("departmentName"),
                "location": item.get("locationName"),
                "employment_type": item.get("employmentType") or "Full-time",
            }
            if job is None:
                session.add(Job(external_id=item["id"], **fields))
                result.created += 1
            else:
                for name, value in fields.items():
                    setattr(job, name, value)
                result.updated += 1
        await session.commit()
        return result

    async def sync_candidates(self, session: AsyncSession) -> SyncResult:
        result = SyncResult()
        for item in await self._list("candidate.list"):
            email = ((item.get("primaryEmailAddress") or {}).get("value") or "").lower()
            if not email:
                result.skipped += 1  # the pipeline needs an email to deduplicate people
                continue
            first, _, last = (item.get("name") or email).partition(" ")
            fields = {
                "first_name": first,
                "last_name": last,
                "email": email,
                "phone": (item.get("primaryPhoneNumber") or {}).get("value"),
                "headline": " at ".join(part for part in (item.get("position"), item.get("company")) if part) or None,
            }
            candidate = await session.scalar(
                select(Candidate).where((Candidate.external_id == item["id"]) | (Candidate.email == email))
            )
            if candidate is None:
                session.add(Candidate(external_id=item["id"], **fields))
                result.created += 1
            else:
                candidate.external_id = item["id"]
                for name, value in fields.items():
                    setattr(candidate, name, value)
                result.updated += 1
        await session.commit()
        return result

    async def sync_applications(self, session: AsyncSession) -> SyncResult:
        """Run after sync_jobs and sync_candidates, which create the records applications point to."""
        result = SyncResult()
        for item in await self._list("application.list"):
            candidate = await session.scalar(
                select(Candidate).where(Candidate.external_id == (item.get("candidate") or {}).get("id"))
            )
            job = await session.scalar(select(Job).where(Job.external_id == (item.get("job") or {}).get("id")))
            stage = STAGE_TYPES.get((item.get("currentInterviewStage") or {}).get("type", ""))
            if candidate is None or job is None or stage is None:
                result.skipped += 1
                continue
            application = await session.scalar(
                select(Application).where(Application.candidate_id == candidate.id, Application.job_id == job.id)
            )
            now = utcnow()
            if application is None:
                application = Application(
                    candidate_id=candidate.id,
                    job_id=job.id,
                    stage=stage,
                    source=(item.get("source") or {}).get("title") or "Ashby",
                )
                session.add(application)
                await session.flush()
                session.add(CandidateStageHistory(application_id=application.id, new_stage=stage, changed_at=now))
                record_activity(
                    session, application.id, ActivityType.APPLICATION_CREATED, "Imported from Ashby", at=now
                )
                result.created += 1
            elif application.stage != stage:
                session.add(
                    CandidateStageHistory(
                        application_id=application.id, previous_stage=application.stage, new_stage=stage, changed_at=now
                    )
                )
                record_activity(
                    session,
                    application.id,
                    ActivityType.STAGE_CHANGED,
                    f"Moved to {stage.label} in Ashby",
                    metadata={"from": application.stage, "to": stage, "source": "ashby"},
                    at=now,
                )
                application.stage = stage
                result.updated += 1
        await session.commit()
        return result

    def verify_signature(self, body: bytes, signature: str | None) -> bool:
        """Ashby signs the raw body with HMAC-SHA256 and sends "sha256=<hex>" in Ashby-Signature."""
        if not self._webhook_secret or not signature:
            return False
        expected = hmac.new(self._webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature.removeprefix("sha256="), expected)

    async def handle_webhook(self, body: bytes, signature: str | None) -> dict[str, Any]:
        """Verify and acknowledge a webhook. Events are not applied yet: run a sync to pull changes."""
        if not self._webhook_secret:
            raise ServiceUnavailableError("Ashby webhooks aren't configured.", code="ashby_not_configured")
        if not self.verify_signature(body, signature):
            raise UnauthorizedError("Invalid Ashby webhook signature.", code="invalid_signature")
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise BadRequestError("Webhook body isn't valid JSON.") from exc
        action = payload.get("action", "unknown") if isinstance(payload, dict) else "unknown"
        logger.info("Received Ashby webhook: %s", action)
        return {"status": "received", "action": action}

    async def _list(self, endpoint: str) -> list[dict[str, Any]]:
        if not self.configured:
            raise ServiceUnavailableError(
                "Ashby isn't connected. Set ASHBY_API_KEY to sync.", code="ashby_not_configured"
            )
        results: list[dict[str, Any]] = []
        cursor: str | None = None
        async with httpx.AsyncClient(
            base_url=BASE_URL, auth=(self._api_key or "", ""), timeout=self._timeout, transport=self._transport
        ) as client:
            while True:
                body: dict[str, Any] = {"limit": 100} | ({"cursor": cursor} if cursor else {})
                try:
                    response = await client.post(f"/{endpoint}", json=body)
                    data = response.json()
                except (httpx.HTTPError, ValueError) as exc:
                    raise AshbyError(f"Couldn't reach Ashby ({endpoint}).") from exc
                if response.status_code >= 400 or not data.get("success"):
                    raise AshbyError(f"Ashby rejected {endpoint} (HTTP {response.status_code}).")
                results.extend(data.get("results", []))
                cursor = data.get("nextCursor")
                if not data.get("moreDataAvailable") or not cursor:
                    return results
