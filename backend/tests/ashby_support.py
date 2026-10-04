"""Builders and fakes for the Ashby, invitation and engagement tests.

Payloads start from the JSON fixtures in tests/fixtures/ashby, which follow Ashby's documented
webhook shapes, and are adjusted per test. Times are relative to now, so tests never go stale.
"""

import copy
import hashlib
import hmac
import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from httpx import AsyncClient

from app.integrations.supabase_admin import AuthUserExists, InvitedUser, SupabaseAdminError

FIXTURES = Path(__file__).parent / "fixtures" / "ashby"
SECRET = "test-ashby-webhook-secret"
WEBHOOK = "/api/v1/integrations/ashby/webhook"

JOB_ID = "4071538b-3c2a-4f1e-9d8c-7b6a5f4e3d21"
CANDIDATE_ID = "5d0c3b7a-9e2f-4a1d-8c6b-2f4e6a8c0d12"
APPLICATION_ID = "c2a6e1d4-0b1f-4e8a-9d3c-7f5e2a1b4c01"
SCHEDULE_ID = "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b"
EVENT_ID = "f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c"
EMAIL = "taylor.applicant@example.com"

STAGES = {
    "Application Review": ("a7f3c2e1-4b5d-4e6f-8a9b-0c1d2e3f4a51", "PreInterviewScreen"),
    "Technical Interview": ("b8a4d3f2-5c6e-4f7a-9b0c-1d2e3f4a5b62", "Active"),
    "Offer": ("c9b5e4a3-6d7f-4a8b-9c0d-1e2f3a4b5c73", "Offer"),
    "Hired": ("d0c6f5b4-7e8a-4b9c-8d1e-2f3a4b5c6d84", "Hired"),
    "Archived": ("e1d7a6c5-8f9b-4c0d-8e2f-3a4b5c6d7e95", "Archived"),
    "Take-home": ("f2e8b7d6-9a0c-4d1e-8f3a-4b5c6d7e8fa6", "Custom"),
}


def iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def ago(**delta: float) -> datetime:
    return datetime.now(UTC) - timedelta(**delta)


def fixture(name: str) -> dict[str, Any]:
    return copy.deepcopy(json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")))


def application_event(
    action: str = "applicationSubmit",
    *,
    application_id: str = APPLICATION_ID,
    candidate_id: str = CANDIDATE_ID,
    email: str | None = EMAIL,
    name: str = "Taylor Applicant",
    job_id: str = JOB_ID,
    job_title: str = "TEST - ML Engineer",
    stage: str = "Application Review",
    status: str = "Active",
    updated_at: datetime | None = None,
    created_at: datetime | None = None,
    archive_reason_type: str | None = None,
    archive_reason_text: str = "Internal: not enough distributed training depth",
    webhook_action_id: str | None = None,
) -> dict[str, Any]:
    """An application webhook (applicationSubmit, applicationUpdate, candidateStageChange, candidateHire)."""
    payload = fixture("candidateHire" if action == "candidateHire" else "applicationSubmit")
    payload["action"] = action
    payload["webhookActionId"] = webhook_action_id or str(uuid.uuid4())
    application = payload["data"]["application"]
    stage_id, stage_type = STAGES[stage]
    application.update(
        id=application_id,
        createdAt=iso(created_at or ago(days=2)),
        updatedAt=iso(updated_at or datetime.now(UTC)),
        status=status,
        currentInterviewStage={
            "id": stage_id,
            "title": stage,
            "type": stage_type,
            "orderInInterviewPlan": 1,
            "interviewPlanId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a77",
        },
        job={"id": job_id, "title": job_title},
    )
    application["candidate"].update(id=candidate_id, name=name)
    if email is None:
        application["candidate"].pop("primaryEmailAddress", None)
    else:
        application["candidate"]["primaryEmailAddress"] = {"value": email, "type": "Personal", "isPrimary": True}
    if archive_reason_type:
        application["archiveReason"] = {
            "id": str(uuid.uuid4()),
            "text": archive_reason_text,
            "reasonType": archive_reason_type,
            "isArchived": False,
            "customFields": [],
        }
        application["archivedAt"] = application["updatedAt"]
    return payload


def schedule_event(
    action: str = "interviewScheduleCreate",
    *,
    application_id: str = APPLICATION_ID,
    schedule_id: str = SCHEDULE_ID,
    event_id: str = EVENT_ID,
    status: str = "Scheduled",
    starts_in: timedelta = timedelta(days=3),
    minutes: int = 60,
    updated_at: datetime | None = None,
    events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = fixture(action)
    payload["webhookActionId"] = str(uuid.uuid4())
    schedule = payload["data"]["interviewSchedule"]
    version = iso(updated_at or datetime.now(UTC))
    schedule.update(id=schedule_id, status=status, applicationId=application_id, updatedAt=version)
    if events is not None:
        schedule["interviewEvents"] = events
    else:
        start = datetime.now(UTC) + starts_in
        event = schedule["interviewEvents"][0]
        event.update(
            id=event_id,
            interviewScheduleId=schedule_id,
            startTime=iso(start),
            endTime=iso(start + timedelta(minutes=minutes)),
            updatedAt=version,
        )
    return payload


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def deliver(
    client: AsyncClient, payload: dict[str, Any] | bytes, *, signature: str | None | bool = True
) -> httpx.Response:
    """POST a webhook the way Ashby does: the raw body, signed (unless signature is given)."""
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "Ashby-Webhook"}
    if signature is True:
        headers["Ashby-Signature"] = sign(body)
    elif isinstance(signature, str):
        headers["Ashby-Signature"] = signature
    return await client.post(WEBHOOK, content=body, headers=headers)


class FakeSupabaseAdmin:
    """Supabase Auth's admin API, in memory. Fails the next `failures` invites, then succeeds."""

    def __init__(self, *, failures: int = 0, existing: set[str] | None = None) -> None:
        self.failures = failures
        self.existing = {email.lower() for email in existing or set()}
        self.invites: list[dict[str, Any]] = []
        self.users: dict[str, uuid.UUID] = {}

    async def invite(self, email: str, *, redirect_to: str, data: dict[str, Any]) -> InvitedUser:
        email = email.lower()
        if self.failures:
            self.failures -= 1
            raise SupabaseAdminError("Supabase Auth returned HTTP 500.")
        if email in self.existing or email in self.users:
            raise AuthUserExists("This email already has a Talent Bridge sign-in.")
        user_id = uuid.uuid5(uuid.NAMESPACE_URL, f"auth:{email}")
        self.users[email] = user_id
        self.invites.append({"email": email, "redirect_to": redirect_to, "data": data})
        return InvitedUser(id=user_id, email=email)


Handler = Callable[[str, dict[str, Any]], tuple[int, dict[str, Any]]]


class FakeAshbyAPI:
    """Ashby's RPC API behind an httpx.MockTransport. Lists are paginated two records a page, and
    hand out a sync token on the last page; with that token only records changed since are listed."""

    PAGE = 2

    def __init__(self) -> None:
        self.records: dict[str, list[dict[str, Any]]] = {
            "job.list": [],
            "candidate.list": [],
            "application.list": [],
            "interviewSchedule.list": [],
        }
        self.details: dict[str, dict[str, Any]] = {}  # "<endpoint>:<id>" -> record
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.version = 0
        self.changed_at: dict[str, int] = {}  # record id -> version it last changed at
        self.expired_tokens: set[str] = set()
        self.fail: dict[str, tuple[int, dict[str, Any]]] = {}  # endpoint -> response to give
        self.override: Handler | None = None

    def add(self, endpoint: str, record: dict[str, Any]) -> None:
        self.version += 1
        records = self.records[endpoint]
        records[:] = [item for item in records if item["id"] != record["id"]] + [record]
        self.changed_at[record["id"]] = self.version

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        endpoint = request.url.path.strip("/")
        body = json.loads(request.content or b"{}")
        self.calls.append((endpoint, body))
        assert request.headers["Authorization"].startswith("Basic ")  # the key, as the username
        if endpoint in self.fail:
            status, payload = self.fail[endpoint]
            return httpx.Response(status, json=payload)
        if self.override:
            status, payload = self.override(endpoint, body)
            return httpx.Response(status, json=payload)
        if endpoint in self.records:
            return httpx.Response(200, json=self._list(endpoint, body))
        key = f"{endpoint}:{body.get('id') or body.get('applicationId')}"
        if key in self.details:
            return httpx.Response(200, json={"success": True, "results": self.details[key]})
        if endpoint == "apiKey.info":
            return httpx.Response(200, json={"success": True, "results": {"title": "Talent Bridge"}})
        return httpx.Response(200, json={"success": False, "errorInfo": {"code": "not_found", "message": "Not found"}})

    def _list(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        token = body.get("syncToken")
        if token in self.expired_tokens:
            return {
                "success": False,
                "errors": ["sync_token_expired"],
                "errorInfo": {"code": "sync_token_expired", "message": "The syncToken has expired."},
            }
        since = int(token.split(":")[1]) if token else 0
        items = [item for item in self.records[endpoint] if self.changed_at[item["id"]] > since]
        start = int(body.get("cursor") or 0)
        page = items[start : start + self.PAGE]
        more = start + self.PAGE < len(items)
        response: dict[str, Any] = {"success": True, "results": page, "moreDataAvailable": more}
        if more:
            response["nextCursor"] = str(start + self.PAGE)
        else:
            response["syncToken"] = f"{endpoint}:{self.version}"
        return response
