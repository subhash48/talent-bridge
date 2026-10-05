"""The development-only demo careers site (services/demo_careers.py): a published demo job takes
applications without a sign-in; each waits, unseen by recruiters, until the applicant activates their
portal account or signs in, and then reaches Talent Bridge through the Ashby simulator, exactly once.
Also the résumé checks and download, the simulator's submit() and reset. That it all runs from app/
alone, with no backend/tests, is in test_production_boundary.py."""

import asyncio
import base64
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import create_engine_for, create_tables, get_session, get_session_factory
from app.core.enums import ApplicationStage, DemoPostingStatus, JobStatus, PortalAccountStatus, UserRole
from app.core.security import TokenVerifier, get_token_verifier
from app.db.seed import seed_id
from app.integrations.ashby import demo
from app.integrations.ashby.client import get_ashby_client
from app.integrations.ashby.demo_ids import DEMO_PREFIX, demo_id
from app.integrations.supabase_admin import InvitedUser, get_supabase_admin
from app.main import app
from app.models import (
    AIAnalysis,
    Application,
    AshbyWebhookEvent,
    Candidate,
    DemoApplication,
    DemoApplicationDemographics,
    DemoJobPosting,
    DemoResume,
    Job,
    User,
)
from app.models.base import utcnow
from app.schemas.demo import MAX_RESUME_BYTES
from app.services import account_provisioning, demo_careers
from app.services.account_service import AuthAccount
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider
from app.services.demo_careers import DEMO_CAREERS_SOURCE
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import (
    ALEX_AUTH,
    API,
    ISSUER,
    KEY_ID,
    POSTGRES_URL,
    SIGNING_KEY,
    SOPHIA_AUTH,
    SOPHIA_EMAIL,
    StaticJWKS,
    bearer,
    fresh_engine,
    link,
    public_jwks,
    user_by_email,
)

EMAIL = "maya.patel@inbox.dev"
PHONE = "+44 20 7946 0958"
JOB = "TEST - Data Scientist"
NOTES = "Internal: backfill for Sam, who leaves in December"  # the recruiter's brief for the AI; never public

PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
DOC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + bytes(504)  # an OLE2 compound file's header, as Word 97-2003 writes
PNG = b"\x89PNG\r\n\x1a\n" + bytes(64)
PDF_TYPE = "application/pdf"
DOC_TYPE = "application/msword"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

POSTING_JOB_STATUS = {
    DemoPostingStatus.DRAFT: JobStatus.DRAFT,
    DemoPostingStatus.PUBLISHED: JobStatus.OPEN,
    DemoPostingStatus.CLOSED: JobStatus.CLOSED,
}


@pytest.fixture(autouse=True)
def demo_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "enable_ashby_demo", True)
    # What the simulator reads, whatever backend/.env says.
    monkeypatch.setattr(settings, "portal_invites_enabled", True)
    monkeypatch.setattr(settings, "ashby_auto_analyze", True)
    monkeypatch.setattr(settings, "ashby_stage_title_map", {})


def docx(*, document: bool = True) -> bytes:
    """A Word document as far as anyone checks: a ZIP archive holding word/document.xml."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        if document:
            archive.writestr("word/document.xml", "<w:document/>")
    return buffer.getvalue()


def upload(content: bytes = PDF, file_name: str = "Maya Patel CV.pdf") -> dict[str, str]:
    # The type the browser reports is ignored: only the content decides.
    return {"file_name": file_name, "content_type": "text/plain", "data": base64.b64encode(content).decode()}


def application(**changes: Any) -> dict[str, Any]:
    return {
        "first_name": "Maya",
        "last_name": "Patel",
        "email": EMAIL,
        "phone": PHONE,
        "linkedin_url": "https://www.linkedin.com/in/maya-patel",
        "resume": upload(),
        **changes,
    }


async def apply_to(client: AsyncClient, job_id: uuid.UUID, **changes: Any) -> httpx.Response:
    return await client.post(f"{API}/demo/careers/jobs/{job_id}/apply", json=application(**changes))


async def demo_job(
    sessions: async_sessionmaker[AsyncSession],
    title: str = JOB,
    *,
    status: DemoPostingStatus = DemoPostingStatus.PUBLISHED,
) -> uuid.UUID:
    """A recruiter's demo job as services/demo_jobs.py makes it: an ordinary job with a tb-demo- Ashby
    id, and its posting."""
    job_id = uuid.uuid4()
    async with sessions() as session:
        session.add(
            Job(
                id=job_id,
                external_id=demo_id("job", str(job_id)),
                title=title,
                department="Machine Learning",
                location="London",
                employment_type="Full-time",
                status=POSTING_JOB_STATUS[status],
                description="Build the models behind data curation.\n\nSkills: Python, PyTorch, SQL",
            )
        )
        await session.flush()
        session.add(
            DemoJobPosting(
                job_id=job_id,
                status=status,
                work_arrangement="Hybrid",
                seniority="Senior",
                skills=["Python", "PyTorch", "SQL"],
                notes=NOTES,
                summary="Build the models behind data curation.",
                about_role="You train and evaluate the models that decide which data teams label next.",
                responsibilities=["Train ranking models", "Run evaluation studies"],
                requirements=["Production Python", "Experience training deep learning models"],
                preferred_qualifications=["Active learning research"],
                about_team="The curation team, inside the platform group.",
                published_at=utcnow() if status != DemoPostingStatus.DRAFT else None,
                closed_at=utcnow() if status == DemoPostingStatus.CLOSED else None,
            )
        )
        await session.commit()
    return job_id


async def close_job(sessions: async_sessionmaker[AsyncSession], job_id: uuid.UUID) -> None:
    """What closing a demo job does: the posting leaves the site, and the job closes in the ATS."""
    async with sessions() as session:
        await session.execute(
            update(DemoJobPosting)
            .where(DemoJobPosting.job_id == job_id)
            .values(status=DemoPostingStatus.CLOSED, closed_at=utcnow())
        )
        await session.execute(update(Job).where(Job.id == job_id).values(status=JobStatus.CLOSED))
        await session.commit()


async def careers_applications(sessions: async_sessionmaker[AsyncSession], email: str = EMAIL) -> list[DemoApplication]:
    async with sessions() as session:
        return list(
            (
                await session.scalars(
                    select(DemoApplication).where(DemoApplication.email == email).order_by(DemoApplication.created_at)
                )
            ).all()
        )


async def count(sessions: async_sessionmaker[AsyncSession], model: type, *where: object) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


def auth_users(*accounts: AuthAccount) -> Callable[..., Awaitable[AuthAccount | None]]:
    """Stands in for reading auth.users, which only Supabase Postgres has."""

    async def find(
        _session: AsyncSession, *, auth_user_id: uuid.UUID | None = None, email: str | None = None
    ) -> AuthAccount | None:
        return next((item for item in accounts if item.id == auth_user_id or item.email == email), None)

    return find


@contextmanager
def recorded_sql(sessions: async_sessionmaker[AsyncSession]) -> Iterator[list[str]]:
    """Every statement the test database runs inside the block."""
    engine = sessions.kw["bind"].sync_engine
    statements: list[str] = []

    def record(_connection: Any, _cursor: Any, statement: str, *_: Any) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", record)


class SupabaseAuth(FakeSupabaseAdmin):
    """FakeSupabaseAdmin, inviting an address again as Supabase Auth does: an account that hasn't
    accepted its invitation gets a new one (the fake refuses any address it has seen). delay holds each
    invitation up, as sending the email takes a moment."""

    def __init__(self, *, delay: float = 0.0) -> None:
        super().__init__()
        self.delay = delay

    async def invite(self, email: str, *, redirect_to: str, data: dict[str, Any]) -> InvitedUser:
        await asyncio.sleep(self.delay)
        email = email.lower()
        if email not in self.users or self.failures or email in self.existing:
            return await super().invite(email, redirect_to=redirect_to, data=data)
        self.invites.append({"email": email, "redirect_to": redirect_to, "data": data})
        return InvitedUser(id=self.users[email], email=email)


def supabase_auth() -> SupabaseAuth:
    """A SupabaseAuth for the API to invite with, in this test."""
    admin = SupabaseAuth()
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    return admin


@pytest.fixture(params=["sqlite file", *(["postgres"] if POSTGRES_URL else [])])
async def concurrent(request: pytest.FixtureRequest, tmp_path: Path) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """A database where each request has a connection of its own and really runs alongside the others:
    a SQLite file, and Postgres too with TALENT_BRIDGE_TEST_POSTGRES_URL."""
    if request.param == "postgres":
        engine = await fresh_engine()
    else:
        engine = create_engine_for(f"sqlite+aiosqlite:///{tmp_path / 'careers.db'}")
        await create_tables(engine)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@asynccontextmanager
async def serving(sessions: async_sessionmaker[AsyncSession], admin: FakeSupabaseAdmin) -> AsyncIterator[AsyncClient]:
    """A client for the API on this database, inviting through this admin; the rest faked as the
    fixtures fake it."""

    async def session_override() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    verifier = TokenVerifier(StaticJWKS(public_jwks((SIGNING_KEY, KEY_ID))), ISSUER)
    app.dependency_overrides.update(
        {
            get_session: session_override,
            get_session_factory: lambda: sessions,
            get_ai_provider: MockProvider,
            get_token_verifier: lambda: verifier,
            get_supabase_admin: lambda: admin,
            get_ashby_client: lambda: None,
        }
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.clear()


# Switched off


@pytest.mark.parametrize("switch", ["flag off", "production"])
async def test_demo_routes_are_404_for_everyone_when_the_demo_is_off(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch, switch: str
) -> None:
    job_id = await demo_job(sessions)
    if switch == "flag off":
        monkeypatch.setattr(settings, "enable_ashby_demo", False)
    else:
        monkeypatch.setattr(settings, "environment", "production")  # ENABLE_ASHBY_DEMO is still true
    routes = [
        ("GET", "/demo/careers/jobs"),
        ("GET", f"/demo/careers/jobs/{job_id}"),
        ("POST", f"/demo/careers/jobs/{job_id}/apply"),
        ("GET", f"/demo/resumes/{uuid.uuid4()}"),
    ]
    for headers in ({}, bearer(ALEX_AUTH), bearer(SOPHIA_AUTH)):
        for method, path in routes:
            body = application() if method == "POST" else None
            response = await anonymous.request(method, f"{API}{path}", json=body, headers=headers)
            assert response.status_code == 404, (method, path)
            assert response.json()["error"] == {
                "code": "not_found",
                "message": "This endpoint doesn't exist.",
                "details": None,
            }
    assert await count(sessions, DemoApplication) == 0


@pytest.mark.parametrize("switch", ["flag off", "production"])
async def test_me_never_reads_the_demo_tables_when_the_demo_is_off(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch, switch: str
) -> None:
    """Production's database has no demo tables, so with the demo off GET /me mustn't even look."""
    if switch == "flag off":
        monkeypatch.setattr(settings, "enable_ashby_demo", False)
    else:
        monkeypatch.setattr(settings, "environment", "production")
    tokens = (bearer(ALEX_AUTH), bearer(SOPHIA_AUTH, email=SOPHIA_EMAIL))
    with recorded_sql(sessions) as statements:
        for token in tokens:
            assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    assert statements
    assert [statement for statement in statements if "demo_" in statement] == []

    # Switched on, the same requests look for applications to submit (and find none).
    monkeypatch.setattr(settings, "enable_ashby_demo", True)
    monkeypatch.setattr(settings, "environment", "test")
    with recorded_sql(sessions) as statements:
        for token in tokens:
            assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    assert any("demo_applications" in statement for statement in statements)


# The careers site


async def test_the_careers_site_lists_published_roles_only(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    older = await demo_job(sessions)
    await demo_job(sessions, "TEST - Platform Engineer")
    hidden = [
        await demo_job(sessions, "TEST - Draft role", status=DemoPostingStatus.DRAFT),
        await demo_job(sessions, "TEST - Closed role", status=DemoPostingStatus.CLOSED),
        seed_id("job", "ML Engineer"),  # an ordinary job, not a demo job
        uuid.uuid4(),
    ]

    listed = (await anonymous.get(f"{API}/demo/careers/jobs")).json()
    assert [job["title"] for job in listed] == ["TEST - Platform Engineer", JOB]  # newest first
    assert listed[1] == {
        "id": str(older),
        "title": JOB,
        "department": "Machine Learning",
        "location": "London",
        "work_arrangement": "Hybrid",
        "employment_type": "Full-time",
        "seniority": "Senior",
        "salary_min": None,
        "salary_max": None,
        "salary_currency": "USD",
        "summary": "Build the models behind data curation.",
        "published_at": listed[1]["published_at"],
    }
    detail = (await anonymous.get(f"{API}/demo/careers/jobs/{older}")).json()
    assert detail["responsibilities"] == ["Train ranking models", "Run evaluation studies"]
    assert detail["requirements"] == ["Production Python", "Experience training deep learning models"]
    assert detail["preferred_qualifications"] == ["Active learning research"]
    assert detail["skills"] == ["Python", "PyTorch", "SQL"]
    assert detail["about_team"] == "The curation team, inside the platform group."
    assert NOTES not in json.dumps([listed, detail])

    for job_id in hidden:
        response = await anonymous.get(f"{API}/demo/careers/jobs/{job_id}")
        assert response.status_code == 404
        assert response.json()["error"] == {
            "code": "job_not_found",
            "message": "This role isn't on the careers site.",
            "details": None,
        }


async def test_only_published_roles_take_applications(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    draft = await demo_job(sessions, status=DemoPostingStatus.DRAFT)
    closed = await demo_job(sessions, status=DemoPostingStatus.CLOSED)
    for job_id, status, code in (
        (draft, 404, "job_not_found"),
        (seed_id("job", "ML Engineer"), 404, "job_not_found"),
        (uuid.uuid4(), 404, "job_not_found"),
        (closed, 409, "job_closed"),
    ):
        response = await apply_to(anonymous, job_id)
        assert (response.status_code, response.json()["error"]["code"]) == (status, code)
    assert response.json()["error"]["message"] == "This role is no longer taking applications."
    assert await count(sessions, DemoApplication) == 0 and ashby.invites == []


# Applying, activating, submitting


async def test_apply_activate_and_reach_the_recruiter(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)

    # 1. Maya applies, without signing in. She is invited to the candidate portal.
    response = await apply_to(anonymous, job_id)
    assert response.status_code == 200
    assert response.json() == {"status": "invitation_sent", "email": EMAIL, "job_title": JOB}
    assert ashby.invites == [
        {"email": EMAIL, "redirect_to": settings.portal_invite_redirect_url, "data": {"full_name": "Maya Patel"}}
    ]

    # 2. Her application waits, unseen: there is no candidate yet, nothing for a recruiter to see.
    [pending] = await careers_applications(sessions)
    assert (pending.status, pending.auth_user_id, pending.invite_error) == (
        "awaiting_activation",
        ashby.users[EMAIL],
        None,
    )
    assert (pending.resume_file_name, pending.resume_content_type, pending.resume_size_bytes) == (
        "Maya Patel CV.pdf",
        PDF_TYPE,
        len(PDF),
    )
    assert pending.resume_sha256 == hashlib.sha256(PDF).hexdigest()
    assert pending.linkedin_url == "https://www.linkedin.com/in/maya-patel"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0
    assert (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["total"] == 0
    assert (await client.get(f"{API}/demo/resumes/{pending.id}")).status_code == 404

    # 3. She accepts the invitation; /welcome calls GET /me, which submits it through the simulator.
    token = bearer(ashby.users[EMAIL], email=EMAIL)
    me = await anonymous.get(f"{API}/me", headers=token)
    assert me.status_code == 200
    assert (me.json()["email"], me.json()["role"], me.json()["full_name"]) == (EMAIL, "candidate", "Maya Patel")
    assert me.json()["candidate_id"] is not None

    # 4. The recruiter sees her as an Ashby applicant in screening, from the demo careers site.
    items = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert [(item["job"]["title"], item["origin"], item["stage"], item["source"]) for item in items] == [
        (JOB, "ashby", "screening", DEMO_CAREERS_SOURCE)
    ]
    candidate = items[0]["candidate"]
    assert candidate["id"] == me.json()["candidate_id"]
    assert (candidate["full_name"], candidate["phone"], candidate["portal_status"]) == ("Maya Patel", PHONE, "invited")
    assert candidate["external_id"] == demo_id("candidate", EMAIL)
    assert candidate["resume_url"] == f"{API}/demo/resumes/{pending.id}"
    application_id = uuid.UUID(items[0]["application_id"])
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == application_id) == 1
    [submitted] = await careers_applications(sessions)
    assert (submitted.status, submitted.application_id, submitted.finalizing_at) == ("submitted", application_id, None)
    assert submitted.submitted_at is not None

    # 5. The résumé, for recruiters only: shown in the browser, never cached or sniffed.
    resume = await client.get(candidate["resume_url"])
    assert resume.status_code == 200 and resume.content == PDF
    assert resume.headers["content-type"] == PDF_TYPE
    assert resume.headers["content-disposition"] == (
        "inline; filename=\"Maya Patel CV.pdf\"; filename*=UTF-8''Maya%20Patel%20CV.pdf"
    )
    assert resume.headers["x-content-type-options"] == "nosniff"
    assert resume.headers["cache-control"] == "private, no-store"
    assert (await anonymous.get(candidate["resume_url"], headers=token)).status_code == 403
    assert (await anonymous.get(candidate["resume_url"], headers=bearer(SOPHIA_AUTH))).status_code == 403
    assert (await anonymous.get(candidate["resume_url"])).status_code == 401

    # 6. Her portal shows the application, and her first visit makes the account active.
    portal = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
    assert [(item["job_title"], item["status"], item["stage_label"]) for item in portal["applications"]] == [
        (JOB, "active", "Screening")
    ]
    assert [entry["title"] for entry in portal["recent_activity"]] == ["Application received"]
    async with sessions() as session:
        assert await session.scalar(select(Candidate.portal_status).where(Candidate.email == EMAIL)) == "active"

    # 7. Signing in again, and again, changes nothing.
    before = (len(ashby.invites), await count(sessions, AshbyWebhookEvent), await count(sessions, AIAnalysis))
    for _ in range(2):
        assert (await anonymous.get(f"{API}/me", headers=token)).json()["candidate_id"] == me.json()["candidate_id"]
    assert (len(ashby.invites), await count(sessions, AshbyWebhookEvent), await count(sessions, AIAnalysis)) == before
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Application, Application.candidate_id == uuid.UUID(candidate["id"])) == 1
    assert await count(sessions, User, User.email == EMAIL) == 1


async def test_applying_again_before_activating_updates_it_and_sends_nothing_new(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)
    word = docx()
    first = await apply_to(anonymous, job_id)
    again = await apply_to(anonymous, job_id, phone="+1 415 555 0199", resume=upload(word, "Maya Patel CV.docx"))
    assert first.json()["status"] == again.json()["status"] == "invitation_sent"
    assert len(ashby.invites) == 1
    [row] = await careers_applications(sessions)
    assert (row.phone, row.resume_file_name, row.resume_content_type) == (
        "+1 415 555 0199",
        "Maya Patel CV.docx",
        DOCX_TYPE,
    )
    assert await count(sessions, DemoResume) == 1

    token = bearer(ashby.users[EMAIL], email=EMAIL)
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert item["candidate"]["phone"] == "+1 415 555 0199"  # what she sent last
    resume = await client.get(item["candidate"]["resume_url"])
    assert (resume.content, resume.headers["content-type"]) == (word, DOCX_TYPE)

    # Submitted: applying once more stores nothing and sends nothing.
    response = await apply_to(anonymous, job_id, phone="+1 415 555 0000")
    assert response.json() == {"status": "already_applied", "email": EMAIL, "job_title": JOB}
    [row] = await careers_applications(sessions)
    assert (row.status, row.phone) == ("submitted", "+1 415 555 0199")
    assert len(ashby.invites) == 1 and await count(sessions, Application, Application.job_id == job_id) == 1


async def test_one_invitation_covers_every_role_and_activating_submits_them_all(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    jobs = [await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer")]
    for job_id in jobs:
        assert (await apply_to(anonymous, job_id)).json()["status"] == "invitation_sent"
    assert len(ashby.invites) == 1
    first, second = await careers_applications(sessions)
    assert first.auth_user_id == second.auth_user_id == ashby.users[EMAIL]
    assert first.invited_at == second.invited_at

    assert (await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))).status_code == 200
    items = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert sorted((item["job"]["title"], item["stage"], item["source"]) for item in items) == [
        (JOB, "screening", DEMO_CAREERS_SOURCE),
        ("TEST - Platform Engineer", "screening", DEMO_CAREERS_SOURCE),
    ]
    assert len({item["candidate"]["id"] for item in items}) == 1  # one person, two applications
    assert {item["candidate"]["resume_url"] for item in items} == {f"{API}/demo/resumes/{second.id}"}  # the latest
    assert await count(sessions, User, User.email == EMAIL) == 1
    for item in items:
        assert await count(sessions, AIAnalysis, AIAnalysis.application_id == uuid.UUID(item["application_id"])) == 1
    assert [row.status for row in await careers_applications(sessions)] == ["submitted", "submitted"]


async def test_our_invitation_also_covers_roles_applied_for_after_it(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On Supabase Postgres a second application also finds the invited account itself (not accepted
    yet). The invitation sent for it covers this one too, and accepting it submits both."""
    first, second = [await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer")]
    assert (await apply_to(anonymous, first)).json()["status"] == "invitation_sent"
    invited = AuthAccount(id=ashby.users[EMAIL], email=EMAIL, email_verified=False)
    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(invited))
    assert (await apply_to(anonymous, second)).json()["status"] == "invitation_sent"
    assert len(ashby.invites) == 1
    rows = await careers_applications(sessions)
    assert [row.auth_user_id for row in rows] == [invited.id, invited.id]
    assert rows[0].invited_at == rows[1].invited_at is not None

    assert (await anonymous.get(f"{API}/me", headers=bearer(invited.id, email=EMAIL))).json()["role"] == "candidate"
    assert [row.status for row in await careers_applications(sessions)] == ["submitted", "submitted"]


async def test_two_sign_ins_at_once_submit_each_application_once(
    concurrent: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The welcome page and the portal can both call GET /me as Maya signs in. Where each request has a
    connection of its own and really runs alongside the other, one submits both applications while the
    other waits for it: neither fails and nothing is made twice."""
    sessions = concurrent
    claimed: list[int] = []
    claim, submit = demo_careers._claim, demo.submit

    async def counted_claim(session: AsyncSession, ids: list[uuid.UUID]) -> set[uuid.UUID]:
        taken = await claim(session, ids)
        claimed.append(len(taken))
        return taken

    async def slow_submit(*args: Any, **kwargs: Any) -> demo.Submitted:
        await asyncio.sleep(0.2)  # time for the other request to find the applications taken
        return await submit(*args, **kwargs)

    monkeypatch.setattr(demo_careers, "_claim", counted_claim)
    monkeypatch.setattr(demo, "submit", slow_submit)
    admin = FakeSupabaseAdmin()
    jobs = [await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer")]
    async with serving(sessions, admin) as http:
        for job_id in jobs:
            assert (await apply_to(http, job_id)).json()["status"] == "invitation_sent"
        token = bearer(admin.users[EMAIL], email=EMAIL)
        responses = await asyncio.gather(*(http.get(f"{API}/me", headers=token) for _ in range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert sorted(claimed) == [0, 2]  # one took both applications; the other waited for it
    candidate_ids = {response.json()["candidate_id"] for response in responses}
    assert len(candidate_ids) == 1 and None not in candidate_ids
    assert await count(sessions, Candidate) == 1
    assert await count(sessions, User) == 1
    assert await count(sessions, Application) == 2
    assert await count(sessions, AIAnalysis) == 2
    assert [row.status for row in await careers_applications(sessions)] == ["submitted", "submitted"]
    assert len(admin.invites) == 1


async def test_applying_for_two_roles_at_once_sends_one_invitation(
    concurrent: async_sessionmaker[AsyncSession],
) -> None:
    """Maya applies for two roles at the same moment, in two tabs. One application waits for the other
    (on Postgres, a lock on her email), so one invitation covers both: neither misses the other's and
    sends a second, nor is told to sign in to the account the other's invitation just made."""
    admin = SupabaseAuth(delay=0.2)  # sending the email takes a moment
    jobs = [await demo_job(concurrent, title) for title in (JOB, "TEST - Platform Engineer")]
    async with serving(concurrent, admin) as http:
        responses = await asyncio.gather(*(apply_to(http, job_id) for job_id in jobs))
    assert [response.json()["status"] for response in responses] == ["invitation_sent", "invitation_sent"]
    assert len(admin.invites) == 1
    rows = await careers_applications(concurrent)
    assert len(rows) == 2 and len({(row.auth_user_id, row.invited_at) for row in rows}) == 1


async def test_a_submission_cut_short_is_finished_and_analysed_by_a_later_sign_in(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The request submitting Maya's application dies after the simulator delivered it but before it is
    recorded (the server restarting, say), and leaves its lease behind. Sign-ins meanwhile don't wait
    for a lease that old. Once it runs out the next one records the submission, and the AI analysis
    the first never queued runs: delivering again is a duplicate, which asks for none."""
    job_id = await demo_job(sessions)
    await apply_to(anonymous, job_id)
    token = bearer(ashby.users[EMAIL], email=EMAIL)

    async def dies(*_: Any) -> None:
        raise RuntimeError("the server restarted")

    with monkeypatch.context() as patched:
        patched.setattr(demo_careers, "_mark_submitted", dies)
        assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200  # linked before it died
    [row] = await careers_applications(sessions)
    assert row.status == "awaiting_activation" and row.finalizing_at is not None
    async with sessions() as session:
        [application_id] = (await session.scalars(select(Application.id).where(Application.job_id == job_id))).all()
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == application_id) == 0

    async def lease_taken(ago: timedelta) -> None:
        async with sessions() as session:
            await session.execute(update(DemoApplication).values(finalizing_at=utcnow() - ago))
            await session.commit()

    await lease_taken(timedelta(minutes=1))
    started = time.monotonic()
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    assert time.monotonic() - started < demo_careers.WAIT_SECONDS / 2
    assert (await careers_applications(sessions))[0].status == "awaiting_activation"

    await lease_taken(demo_careers.SUBMIT_LEASE + timedelta(seconds=1))
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    [row] = await careers_applications(sessions)
    assert (row.status, row.application_id, row.finalizing_at) == ("submitted", application_id, None)
    assert await count(sessions, Application, Application.job_id == job_id) == 1
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == application_id) == 1


async def test_without_auto_analysis_no_analysis_is_queued(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ashby_auto_analyze", False)
    await apply_to(anonymous, await demo_job(sessions))
    assert (await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))).status_code == 200
    [row] = await careers_applications(sessions)
    assert row.status == "submitted"
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == row.application_id) == 0


async def test_an_invitation_is_sent_again_once_its_link_has_expired(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Supabase's email links work for an hour. Applying after that, for the same role or another,
    sends a new invitation (Supabase invites an account that never accepted again), and while its link
    works that one covers every role. Accepting it submits them all."""
    admin = supabase_auth()
    first, second, third = [
        await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer", "TEST - Data Engineer")
    ]

    async def an_hour_passes() -> None:
        async with sessions() as session:
            await session.execute(update(DemoApplication).values(invited_at=utcnow() - timedelta(minutes=61)))
            await session.commit()

    assert (await apply_to(anonymous, first)).json()["status"] == "invitation_sent"
    await an_hour_passes()
    assert (await apply_to(anonymous, first)).json()["status"] == "invitation_sent"
    await an_hour_passes()
    assert (await apply_to(anonymous, second)).json()["status"] == "invitation_sent"
    assert (await apply_to(anonymous, third)).json()["status"] == "invitation_sent"  # covered by the last one
    assert [invite["email"] for invite in admin.invites] == [EMAIL, EMAIL, EMAIL]
    rows = await careers_applications(sessions)
    assert {row.auth_user_id for row in rows} == {admin.users[EMAIL]}
    assert rows[0].invited_at < rows[1].invited_at == rows[2].invited_at

    me = await anonymous.get(f"{API}/me", headers=bearer(admin.users[EMAIL], email=EMAIL))
    assert me.json()["role"] == "candidate"
    assert [row.status for row in await careers_applications(sessions)] == ["submitted", "submitted", "submitted"]


async def test_an_application_left_a_day_is_submitted_only_once_made_again(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Ana, who has a portal account, applies and doesn't sign in for a day. Her routine sign-in then
    submits nothing (it might be an application someone else made with her email), until she sends the
    form again, even unchanged."""
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana, portal_status=PortalAccountStatus.ACTIVE))
        await session.commit()
    token = await link(sessions, ana)
    job_id = await demo_job(sessions)
    form = {"email": ana, "first_name": "Ana", "last_name": "Silva"}
    assert (await apply_to(anonymous, job_id, **form)).json()["status"] == "sign_in_required"
    async with sessions() as session:
        await session.execute(update(DemoApplication).values(updated_at=utcnow() - timedelta(hours=24, minutes=1)))
        await session.commit()

    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    assert (await careers_applications(sessions, ana))[0].status == "awaiting_sign_in"
    assert await count(sessions, Application, Application.job_id == job_id) == 0

    assert (await apply_to(anonymous, job_id, **form)).json()["status"] == "sign_in_required"
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    assert (await careers_applications(sessions, ana))[0].status == "submitted"


async def test_a_new_candidate_is_named_exactly_as_they_typed(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ashby sends one full name, which the importer splits at its first space."""
    await apply_to(anonymous, await demo_job(sessions), first_name="Mary Ann", last_name="Smith")
    assert (await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))).status_code == 200
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == EMAIL))
    assert candidate is not None and (candidate.first_name, candidate.last_name) == ("Mary Ann", "Smith")
    user = await user_by_email(sessions, EMAIL)
    assert user is not None and user.full_name == "Mary Ann Smith"


# Accounts that exist already


async def test_an_existing_portal_account_signs_in_to_submit(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ana already uses the candidate portal: no invitation; signing in submits it to her own record."""
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana, portal_status=PortalAccountStatus.ACTIVE))
        await session.commit()
    token = await link(sessions, ana)
    job_id = await demo_job(sessions)

    response = await apply_to(anonymous, job_id, email=ana, first_name="Ana", last_name="Silva")
    assert response.json() == {"status": "sign_in_required", "email": ana, "job_title": JOB}
    assert ashby.invites == []
    [row] = await careers_applications(sessions, ana)
    assert row.status == "awaiting_sign_in"

    me = (await anonymous.get(f"{API}/me", headers=token)).json()
    assert me["role"] == "candidate"
    async with sessions() as session:
        records = (await session.scalars(select(Candidate).where(Candidate.email == ana))).all()
    assert [str(record.id) for record in records] == [me["candidate_id"]]  # her record, not a new one
    portal = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
    assert [(item["job_title"], item["stage_label"]) for item in portal["applications"]] == [(JOB, "Screening")]
    assert (await careers_applications(sessions, ana))[0].status == "submitted"


@pytest.mark.parametrize(("verified", "outcome"), [(True, "sign_in_required"), (False, "invitation_sent")])
async def test_an_existing_supabase_account_is_used(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    verified: bool,
    outcome: str,
) -> None:
    """Supabase has an account for the email already: confirmed (they sign in, and no invitation is
    sent), or not confirmed yet, with no invitation of ours out for it (Supabase invites that account,
    and accepting submits this)."""
    account = AuthAccount(id=uuid.uuid4(), email=EMAIL, email_verified=verified)
    admin = supabase_auth()
    admin.users[EMAIL] = account.id
    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(account))
    job_id = await demo_job(sessions)
    assert (await apply_to(anonymous, job_id)).json()["status"] == outcome
    assert [invite["email"] for invite in admin.invites] == ([] if verified else [EMAIL])
    [row] = await careers_applications(sessions)
    assert row.auth_user_id == account.id and (row.invited_at is None) == verified

    # Signing in to it once the address is confirmed (accepting an invitation confirms it).
    confirmed = AuthAccount(id=account.id, email=EMAIL, email_verified=True)
    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(confirmed))
    me = await anonymous.get(f"{API}/me", headers=bearer(account.id, email=EMAIL))
    assert me.status_code == 200 and me.json()["role"] == "candidate"
    assert (await careers_applications(sessions))[0].status == "submitted"


async def test_an_invitation_vouches_only_for_the_account_it_created(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Maya was invited. Then Supabase has another account for her address, not confirmed (the invited
    one deleted, and someone signing up with the address), and the form is sent again. Signing in to
    that account submits nothing: the invitation was for the other."""
    job_id = await demo_job(sessions)
    assert (await apply_to(anonymous, job_id)).json()["status"] == "invitation_sent"
    other = AuthAccount(id=uuid.uuid4(), email=EMAIL, email_verified=False)
    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(other))
    assert (await apply_to(anonymous, job_id)).status_code == 200
    [row] = await careers_applications(sessions)
    assert (row.auth_user_id, row.invited_at) == (other.id, None)

    response = await anonymous.get(f"{API}/me", headers=bearer(other.id, email=EMAIL))
    assert response.status_code == 403 and response.json()["error"]["code"] == "account_not_linked"
    assert (await careers_applications(sessions))[0].status == "awaiting_activation"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0


async def test_an_account_that_never_confirmed_the_address_submits_nothing(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Some Supabase projects let anyone sign up as any address and sign straight in, the address
    confirmed without an email. Such an account proves nothing. Supabase won't invite it, so the
    applicant is asked to sign in, and signing in to it submits nothing."""
    squatter = AuthAccount(id=uuid.uuid4(), email=EMAIL, email_verified=False)
    ashby.existing.add(EMAIL)  # its address counts as confirmed, so Supabase refuses to invite it
    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(squatter))
    job_id = await demo_job(sessions)
    assert (await apply_to(anonymous, job_id)).json()["status"] == "sign_in_required"
    response = await anonymous.get(f"{API}/me", headers=bearer(squatter.id, email=EMAIL))
    assert response.status_code == 403 and response.json()["error"]["code"] == "account_not_linked"
    assert (await careers_applications(sessions))[0].status == "awaiting_sign_in"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0


async def test_an_account_supabase_reports_is_submitted_by_signing_in(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Supabase refuses the invitation (the email has an account we couldn't see): sign in to submit,
    which works once the sign-in proves its owner confirmed the address."""
    ashby.existing.add(EMAIL)
    job_id = await demo_job(sessions)
    assert (await apply_to(anonymous, job_id)).json()["status"] == "sign_in_required"
    [row] = await careers_applications(sessions)
    assert (row.status, row.auth_user_id, row.invite_error) == ("awaiting_sign_in", None, None)

    account = AuthAccount(id=uuid.uuid4(), email=EMAIL, email_verified=True)
    token = bearer(account.id, email=EMAIL)
    # Without that proof (SQLite can't read auth.users), it stays pending and they aren't let in.
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 403
    assert (await careers_applications(sessions))[0].status == "awaiting_sign_in"

    monkeypatch.setattr(demo_careers, "find_auth_account", auth_users(account))
    assert (await anonymous.get(f"{API}/me", headers=token)).json()["role"] == "candidate"
    assert (await careers_applications(sessions))[0].status == "submitted"
    assert ashby.invites == []


# Who may submit


async def test_a_sign_in_for_another_email_submits_nothing(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)
    await apply_to(anonymous, job_id)
    for token in (
        bearer(ashby.users[EMAIL], email="someone.else@inbox.dev"),  # the invited account, now another email
        bearer(uuid.uuid4(), email=EMAIL),  # another account claiming her email
        bearer(ashby.users[EMAIL]),  # no email at all
    ):
        response = await anonymous.get(f"{API}/me", headers=token)
        assert response.status_code == 403 and response.json()["error"]["code"] == "account_not_linked"
    assert (await careers_applications(sessions))[0].status == "awaiting_activation"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0

    # A linked candidate whose sign-in carries another email is refused, and submits nothing either.
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana))
        await session.commit()
    await link(sessions, ana)
    await apply_to(anonymous, job_id, email=ana)
    mismatch = await anonymous.get(
        f"{API}/me", headers=bearer(uuid.uuid5(uuid.NAMESPACE_URL, f"auth:{ana}"), email="not.ana@inbox.dev")
    )
    assert mismatch.status_code == 403 and mismatch.json()["error"]["code"] == "account_mismatch"
    assert (await careers_applications(sessions, ana))[0].status == "awaiting_sign_in"


async def test_staff_emails_never_apply_or_submit(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)
    async with sessions() as session:
        session.add(User(email="hannah.lee@hiring-team.dev", full_name="Hannah Lee", role=UserRole.RECRUITER))
        await session.commit()
    response = await apply_to(anonymous, job_id, email="Hannah.Lee@Hiring-Team.dev")
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "email_not_accepted",
        "message": "This email can't be used to apply. Use your personal email.",
        "details": None,
    }

    # Someone applies, and is made staff before they activate: signing in as staff submits nothing.
    await apply_to(anonymous, job_id)
    async with sessions() as session:
        session.add(User(email=EMAIL, full_name="Maya Patel", role=UserRole.RECRUITER, auth_user_id=ashby.users[EMAIL]))
        await session.commit()
    me = await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))
    assert me.status_code == 200 and me.json()["role"] == "recruiter"
    assert (await careers_applications(sessions))[0].status == "awaiting_activation"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0


async def test_activating_never_links_a_staff_users_row(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Someone applies, and before they activate a recruiter's users row is made with that email, for an
    operator to link to a sign-in. Activating submits nothing: linking would give them that row."""
    await apply_to(anonymous, await demo_job(sessions))
    async with sessions() as session:
        session.add(User(email=EMAIL, full_name="Maya Patel", role=UserRole.RECRUITER))
        await session.commit()
    response = await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))
    assert response.status_code == 403 and response.json()["error"]["code"] == "account_not_linked"
    staff = await user_by_email(sessions, EMAIL)
    assert staff is not None and (staff.role, staff.auth_user_id) == ("recruiter", None)
    assert (await careers_applications(sessions))[0].status == "awaiting_activation"
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0


async def test_signing_in_never_rewrites_someone_talent_bridge_has(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ana is in Talent Bridge with her own details and a recruiter's link to her résumé. Someone sends
    the form with her email and their own name, phone and résumé, and Ana's next routine sign-in submits
    it. Her record keeps what it had, and stays hers: not taken for simulator data, which reset deletes."""
    ana, cv = "ana.silva@inbox.dev", "https://files.example.org/ana-silva-cv.pdf"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana, phone="+351 21 000 0000", resume_url=cv))
        await session.commit()
    token = await link(sessions, ana)
    job_id = await demo_job(sessions)
    someone = {"email": ana, "first_name": "Eve", "last_name": "Mallory", "phone": "+1 202 555 0199"}
    assert (await apply_to(anonymous, job_id, **someone)).json()["status"] == "sign_in_required"

    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    async with sessions() as session:
        record = await session.scalar(select(Candidate).where(Candidate.email == ana))
        assert record is not None
        applications = (await session.scalars(select(Application).where(Application.candidate_id == record.id))).all()
    assert (record.first_name, record.last_name, record.phone, record.resume_url) == (
        "Ana",
        "Silva",
        "+351 21 000 0000",
        cv,
    )
    assert record.external_id is None
    assert [(item.job_id, item.source) for item in applications] == [(job_id, DEMO_CAREERS_SOURCE)]


async def test_moving_a_careers_application_in_the_simulator_moves_only_the_application(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """`demo stage` on careers applicants: a new one keeps the name as typed and their own phone (not the
    fixture's), and someone Talent Bridge had before keeps no Ashby id, so reset never takes them."""
    await apply_to(anonymous, await demo_job(sessions), first_name="Mary Ann", last_name="Smith")
    assert (await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))).status_code == 200
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana, phone="+351 21 000 0000"))
        await session.commit()
    token = await link(sessions, ana)
    form = {"email": ana, "first_name": "Ana", "last_name": "Silva"}
    assert (await apply_to(anonymous, await demo_job(sessions, "TEST - Analyst"), **form)).json()["status"] == (
        "sign_in_required"
    )
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200

    for email in (EMAIL, ana):
        await demo.stage(sessions, email=email, stage="interview")

    async with sessions() as session:
        people = {
            person.email: person
            for person in await session.scalars(select(Candidate).where(Candidate.email.in_([EMAIL, ana])))
        }
        stages = (
            await session.scalars(
                select(Application.stage).where(Application.candidate_id.in_([p.id for p in people.values()]))
            )
        ).all()
    assert (people[EMAIL].first_name, people[EMAIL].last_name, people[EMAIL].phone) == ("Mary Ann", "Smith", PHONE)
    assert (people[ana].first_name, people[ana].last_name, people[ana].phone, people[ana].external_id) == (
        "Ana",
        "Silva",
        "+351 21 000 0000",
        None,
    )
    assert stages == [ApplicationStage.INTERVIEW, ApplicationStage.INTERVIEW]


async def test_an_application_a_recruiter_made_meanwhile_stands(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ana applies on the careers site. Before she signs in, a recruiter adds her to the same job in
    Talent Bridge and moves her on. Signing in takes that application for this one and leaves it as it
    is: nothing is delivered, so the importer never adopts it and moves it back to screening."""
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana))
        await session.commit()
    token = await link(sessions, ana)
    job_id = await demo_job(sessions)
    form = {"email": ana, "first_name": "Ana", "last_name": "Silva"}
    assert (await apply_to(anonymous, job_id, **form)).json()["status"] == "sign_in_required"
    async with sessions() as session:
        candidate_id = await session.scalar(select(Candidate.id).where(Candidate.email == ana))
        added = Application(
            candidate_id=candidate_id, job_id=job_id, stage=ApplicationStage.INTERVIEW, source="Referral"
        )
        session.add(added)
        await session.commit()

    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    [row] = await careers_applications(sessions, ana)
    assert (row.status, row.application_id) == ("submitted", added.id)
    async with sessions() as session:
        applications = (
            await session.execute(
                select(Application.id, Application.stage, Application.source, Application.external_id).where(
                    Application.candidate_id == candidate_id
                )
            )
        ).all()
    assert [tuple(item) for item in applications] == [(added.id, "interview", "Referral", None)]
    assert await count(sessions, AshbyWebhookEvent) == 0
    assert await count(sessions, AIAnalysis, AIAnalysis.application_id == added.id) == 0


async def test_an_existing_application_for_the_role_means_already_applied(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """However it was made: here, a recruiter added her to the job in Talent Bridge."""
    job_id = await demo_job(sessions)
    async with sessions() as session:
        candidate = Candidate(first_name="Maya", last_name="Patel", email=EMAIL)
        session.add(candidate)
        await session.flush()
        session.add(Application(candidate_id=candidate.id, job_id=job_id))
        await session.commit()
    response = await apply_to(anonymous, job_id)
    assert response.json() == {"status": "already_applied", "email": EMAIL, "job_title": JOB}
    assert await count(sessions, DemoApplication) == 0 and ashby.invites == []


# Invitations that can't be sent


async def test_a_failed_invitation_is_saved_and_applying_again_retries_it(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)
    ashby.failures = 1
    assert (await apply_to(anonymous, job_id)).json()["status"] == "invitation_failed"
    [row] = await careers_applications(sessions)
    assert (row.status, row.invite_error, row.auth_user_id, row.invited_at) == (
        "awaiting_activation",
        "We couldn't send the activation email just now.",
        None,
        None,
    )
    assert ashby.invites == []

    assert (await apply_to(anonymous, job_id)).json()["status"] == "invitation_sent"
    [row] = await careers_applications(sessions)
    assert (row.invite_error, row.auth_user_id) == (None, ashby.users[EMAIL])
    assert len(ashby.invites) == 1


async def test_without_supabase_admin_the_application_is_saved_and_says_why(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """SUPABASE_SECRET_KEY isn't set (the anonymous fixture has no admin client)."""
    job_id = await demo_job(sessions)
    assert (await apply_to(anonymous, job_id)).json()["status"] == "invitation_failed"
    [row] = await careers_applications(sessions)
    assert row.invite_error == account_provisioning.NOT_CONFIGURED


# What is checked


async def test_emails_that_cant_receive_the_activation_link_are_refused(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    job_id = await demo_job(sessions)
    for email in ("maya.patel@example.com", "maya@mail.example.org"):
        response = await apply_to(anonymous, job_id, email=email)
        assert response.status_code == 422
        assert response.json()["error"] == {
            "code": "email_not_accepted",
            "message": "Use an email address you can receive mail at: your activation link is sent there.",
            "details": None,
        }
    assert await count(sessions, DemoApplication) == 0 and ashby.invites == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "not-an-email"),
        ("phone", "12"),
        ("phone", "call me maybe"),
        ("linkedin_url", "https://example.com/in/maya"),
        ("first_name", ""),
        ("resume", {"file_name": "cv.pdf", "data": ""}),
    ],
)
async def test_the_application_form_is_validated(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], field: str, value: Any
) -> None:
    response = await apply_to(anonymous, await demo_job(sessions), **{field: value})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["details"][0]["field"] == ("resume.data" if field == "resume" else field)
    assert await count(sessions, DemoApplication) == 0


INVALID_RESUMES: dict[str, tuple[Callable[[], dict[str, str]], str]] = {
    "a PNG renamed .pdf": (lambda: upload(PNG, "cv.pdf"), "Upload your résumé as a PDF, DOC or DOCX file."),
    "a ZIP that isn't a Word file": (
        lambda: upload(docx(document=False), "cv.docx"),
        "Upload your résumé as a PDF, DOC or DOCX file.",
    ),
    "a damaged ZIP": (
        lambda: upload(b"PK\x03\x04" + bytes(40), "cv.docx"),
        "Upload your résumé as a PDF, DOC or DOCX file.",
    ),
    "larger than 5 MB": (
        lambda: upload(b"%PDF-" + bytes(MAX_RESUME_BYTES), "cv.pdf"),
        "The résumé is larger than 5 MB. Upload a smaller file.",
    ),
    "not base64": (
        lambda: {"file_name": "cv.pdf", "data": "not base64!"},
        "The résumé didn't arrive intact. Choose the file again.",
    ),
    "base64 with its padding missing": (
        lambda: {"file_name": "cv.pdf", "data": "JVBERi0"},
        "The résumé didn't arrive intact. Choose the file again.",
    ),
    "a PDF named .docx": (
        lambda: upload(PDF, "cv.docx"),
        "The résumé is a PDF file, but its name doesn't end in .pdf. Upload the original file.",
    ),
    "a Word file named .pdf": (
        lambda: upload(docx(), "cv.pdf"),
        "The résumé is a DOCX file, but its name doesn't end in .docx. Upload the original file.",
    ),
    "a DOC named .docx": (
        lambda: upload(DOC, "cv.docx"),
        "The résumé is a DOC file, but its name doesn't end in .doc. Upload the original file.",
    ),
    "no extension": (
        lambda: upload(PDF, "cv"),
        "The résumé is a PDF file, but its name doesn't end in .pdf. Upload the original file.",
    ),
}


@pytest.mark.parametrize("case", INVALID_RESUMES)
async def test_the_resume_must_be_a_pdf_doc_or_docx(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin, case: str
) -> None:
    resume, message = INVALID_RESUMES[case]
    response = await apply_to(anonymous, await demo_job(sessions), resume=resume())
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "invalid_resume", "message": message, "details": None}
    assert await count(sessions, DemoApplication) == 0 and await count(sessions, DemoResume) == 0
    assert ashby.invites == []


@pytest.mark.parametrize(
    ("content", "file_name", "stored_as", "content_type"),
    [
        (PDF, "Maya Patel CV.pdf", "Maya Patel CV.pdf", PDF_TYPE),
        (DOC, "cv.DOC", "cv.DOC", DOC_TYPE),
        (docx(), "Maya Patel CV.docx", "Maya Patel CV.docx", DOCX_TYPE),
        # Folders, quotes and control characters go; the name is shortened, keeping its extension.
        (PDF, 'C:\\Users\\maya\\"Final"\x07 CV\u202e.pdf', "Final CV.pdf", PDF_TYPE),
        (PDF, "../../" + "a" * 200 + ".pdf", "a" * 116 + ".pdf", PDF_TYPE),
        (PDF, ".pdf", "resume.pdf", PDF_TYPE),
    ],
    ids=["pdf", "doc", "docx", "unsafe name", "long name", "no name"],
)
async def test_the_resume_is_stored_privately_as_its_content_says(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    content: bytes,
    file_name: str,
    stored_as: str,
    content_type: str,
) -> None:
    body = {"file_name": file_name, "data": base64.encodebytes(content).decode()}  # line breaks are fine
    assert (await apply_to(anonymous, await demo_job(sessions), resume=body)).status_code == 200
    [row] = await careers_applications(sessions)
    assert (row.resume_file_name, row.resume_content_type, row.resume_size_bytes) == (
        stored_as,
        content_type,
        len(content),
    )
    assert row.resume_sha256 == hashlib.sha256(content).hexdigest()
    async with sessions() as session:
        stored = await session.get(DemoResume, row.id)
    assert stored is not None and stored.content == content


async def test_the_resume_download_keeps_unicode_names(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    word = docx()
    await apply_to(anonymous, await demo_job(sessions), resume=upload(word, "Résumé – Maya Patel.docx"))
    await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))
    [row] = await careers_applications(sessions)
    resume = await client.get(f"{API}/demo/resumes/{row.id}")
    assert (resume.content, resume.headers["content-type"]) == (word, DOCX_TYPE)
    assert resume.headers["content-disposition"] == (
        "inline; filename=\"Resume Maya Patel.docx\"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%E2%80%93%20Maya%20Patel.docx"
    )
    assert (await client.get(f"{API}/demo/resumes/{uuid.uuid4()}")).status_code == 404


# Jobs that close


async def test_a_role_that_closes_shows_as_closed_and_takes_no_more_applications(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    closing, staying = [await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer")]
    for job_id in (closing, staying):
        await apply_to(anonymous, job_id)
    # It closes before Maya activates: her application is still submitted, and shows the role closed.
    await close_job(sessions, closing)
    token = bearer(ashby.users[EMAIL], email=EMAIL)
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    portal = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
    assert sorted((item["job_title"], item["status"], item["stage_label"]) for item in portal["applications"]) == [
        (JOB, "inactive", "Role closed"),
        ("TEST - Platform Engineer", "active", "Screening"),
    ]
    response = await apply_to(anonymous, closing, email="someone.new@inbox.dev")
    assert (response.status_code, response.json()["error"]["code"]) == (409, "job_closed")
    assert (await anonymous.get(f"{API}/demo/careers/jobs/{closing}")).status_code == 404


# Packaging


def test_a_stray_ashby_module_cant_shadow_the_package(tmp_path: Path) -> None:
    """OneDrive once restored an old app/integrations/ashby.py beside the ashby/ folder, and the API
    couldn't start: a folder without __init__.py loses to a module of the same name. With one, it wins."""
    backend = Path(__file__).resolve().parents[1]
    package = tmp_path / "app" / "integrations" / "ashby"
    shutil.copytree(backend / package.relative_to(tmp_path), package, ignore=shutil.ignore_patterns("__pycache__"))
    (package.parent / "ashby.py").write_text("raise ImportError('the stray ashby.py was imported')\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-c", "import app.integrations.ashby.importer"],
        cwd=tmp_path,  # where the copy is, beside the stray module; the rest of app/ comes from backend/
        env={**os.environ, "PYTHONPATH": os.pathsep.join((str(tmp_path), str(backend)))},
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stderr


# The simulator


async def test_submit_delivers_to_an_existing_job_once(sessions: async_sessionmaker[AsyncSession]) -> None:
    """submit() with a job's Ashby id: no jobCreate, the given phone and source, and a rerun is a
    duplicate delivery."""
    job_id = await demo_job(sessions)
    external_id = demo_id("job", str(job_id))
    jobs_before = await count(sessions, Job)
    values = {
        "email": EMAIL,
        "first_name": "Maya",
        "last_name": "Patel",
        "job_title": JOB,
        "job_external_id": external_id,
        "phone": PHONE,
        "source": DEMO_CAREERS_SOURCE,
    }
    first = await demo.submit(sessions, **values)
    assert first.outcome.lines == ["applicationSubmit: processed"]
    assert first.application_id is not None and first.candidate_id is not None
    assert first.follow_ups.analyze_application_ids == {first.application_id}
    again = await demo.submit(sessions, **values)
    assert again.outcome.lines == ["applicationSubmit: duplicate (delivered before, so nothing was applied again)"]
    assert (again.application_id, again.candidate_id) == (first.application_id, first.candidate_id)
    assert again.follow_ups.analyze_application_ids == set()

    assert await count(sessions, Job) == jobs_before
    async with sessions() as session:
        application = await session.get(Application, first.application_id)
        candidate = await session.get(Candidate, first.candidate_id)
    assert application is not None and candidate is not None
    assert (application.job_id, application.source, application.stage) == (job_id, DEMO_CAREERS_SOURCE, "screening")
    assert application.external_id == demo_id("application", EMAIL, external_id)
    assert (candidate.email, candidate.phone, candidate.portal_status) == (EMAIL, PHONE, "pending_invitation")


async def test_submit_without_the_profile_leaves_the_candidate_as_they_are(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    """profile=False sends no name and no phone, not even the fixture's."""
    async with sessions() as session:
        session.add(Candidate(first_name="Mary Ann", last_name="Smith", email=EMAIL))
        await session.commit()
    job_id = await demo_job(sessions)
    submitted = await demo.submit(
        sessions,
        email=EMAIL,
        first_name="Someone",
        last_name="Else",
        job_title=JOB,
        job_external_id=demo_id("job", str(job_id)),
        profile=False,
    )
    assert submitted.application_id is not None
    async with sessions() as session:
        candidate = await session.get(Candidate, submitted.candidate_id)
    assert candidate is not None
    assert (candidate.first_name, candidate.last_name, candidate.phone) == ("Mary Ann", "Smith", None)


async def test_reset_works_without_the_demo_careers_tables(sessions: async_sessionmaker[AsyncSession]) -> None:
    """A database with migrations 001-012 only (013 is the demo careers site's, and 014 builds on it): the
    simulator works there, and so does its reset."""
    await demo.submit(sessions, email=EMAIL, first_name="Maya", last_name="Patel", job_title=JOB)
    async with sessions.kw["bind"].begin() as connection:
        for model in (DemoApplicationDemographics, DemoResume, DemoApplication, DemoJobPosting):
            await connection.run_sync(model.__table__.drop)
    outcome = await demo.reset(sessions)
    assert outcome.lines[0] == (
        "Deleted 1 application(s), 1 candidate(s), 0 portal sign-in link(s), 1 job(s), "
        "0 demo careers application(s) and 2 webhook event(s) made by the simulator."
    )
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 0


async def test_reset_keeps_people_talent_bridge_had_without_their_demo_resume(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Ana was in Talent Bridge before she applied on the careers site. Reset deletes that application
    and the résumé she sent with it, but not Ana, whose record stops linking to that résumé."""
    ana = "ana.silva@inbox.dev"
    async with sessions() as session:
        session.add(Candidate(first_name="Ana", last_name="Silva", email=ana, portal_status=PortalAccountStatus.ACTIVE))
        await session.commit()
    token = await link(sessions, ana)
    await apply_to(anonymous, await demo_job(sessions), email=ana, first_name="Ana", last_name="Silva")
    assert (await anonymous.get(f"{API}/me", headers=token)).status_code == 200
    [row] = await careers_applications(sessions, ana)
    async with sessions() as session:
        record = await session.scalar(select(Candidate).where(Candidate.email == ana))
    assert record is not None and (record.resume_url, record.external_id) == (f"{API}/demo/resumes/{row.id}", None)

    await demo.reset(sessions)
    async with sessions() as session:
        kept = await session.get(Candidate, record.id, populate_existing=True)
    assert kept is not None and (kept.resume_url, kept.user_id) == (None, record.user_id)
    assert await count(sessions, Application, Application.candidate_id == record.id) == 0
    assert await count(sessions, DemoApplication) == 0
    assert (await anonymous.get(f"{API}/candidate/me", headers=token)).status_code == 200  # she still signs in


async def test_reset_removes_the_demo_careers_records(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    before = {model.__tablename__: await count(sessions, model) for model in (Application, Candidate, Job, User)}
    submitted_job, pending_job = [await demo_job(sessions, title) for title in (JOB, "TEST - Platform Engineer")]
    await apply_to(anonymous, submitted_job)
    await anonymous.get(f"{API}/me", headers=bearer(ashby.users[EMAIL], email=EMAIL))
    await apply_to(anonymous, pending_job, email="someone.new@inbox.dev")

    outcome = await demo.reset(sessions)
    assert outcome.lines[0] == (
        "Deleted 1 application(s), 1 candidate(s), 1 portal sign-in link(s), 2 job(s), "
        "2 demo careers application(s) and 1 webhook event(s) made by the simulator."
    )
    for model in (DemoApplication, DemoResume, DemoJobPosting):
        assert await count(sessions, model) == 0, model.__tablename__
    assert await count(sessions, Job, Job.external_id.startswith(DEMO_PREFIX)) == 0
    assert {
        model.__tablename__: await count(sessions, model) for model in (Application, Candidate, Job, User)
    } == before
    assert (await anonymous.get(f"{API}/demo/careers/jobs")).json() == []
    assert (await client.get(f"{API}/candidates")).json()["total"] > 0  # the rest of the pipeline is untouched
