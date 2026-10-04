"""Candidate portal accounts for Ashby applicants: invite, reuse, link, fail safely, retry."""

import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.integrations.supabase_admin import get_supabase_admin
from app.main import app
from app.models import Application, Candidate, User
from app.models.base import utcnow
from app.services import account_provisioning
from app.services.account_provisioning import provision_portal_account
from app.services.account_service import AuthAccount
from tests.ashby_support import EMAIL, FakeSupabaseAdmin, application_event, deliver
from tests.conftest import API, SOPHIA_EMAIL, bearer, candidate_id

pytestmark = pytest.mark.usefixtures("ashby")


async def candidate_by_email(sessions: async_sessionmaker[AsyncSession], email: str) -> Candidate:
    async with sessions() as session:
        candidate = await session.scalar(select(Candidate).where(Candidate.email == email))
        assert candidate is not None
        return candidate


async def count(sessions: async_sessionmaker[AsyncSession], model: type, *where: object) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model).where(*where)) or 0


async def test_new_applicant_is_invited_once_with_no_password(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    await deliver(anonymous, application_event())
    candidate = await candidate_by_email(sessions, EMAIL)
    assert candidate.portal_status == "invited" and candidate.portal_invited_at is not None
    assert candidate.portal_invite_attempts == 1 and candidate.portal_invite_error is None
    async with sessions() as session:
        user = await session.get(User, candidate.user_id)
    assert user is not None and user.role == "candidate" and user.email == EMAIL
    assert user.auth_user_id == ashby.users[EMAIL]
    assert ashby.invites[0]["data"] == {"full_name": "Taylor Applicant"}


async def test_second_application_reuses_the_same_account(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    await deliver(anonymous, application_event())
    await deliver(
        anonymous,
        application_event(application_id=str(uuid.uuid4()), job_id=str(uuid.uuid4()), job_title="TEST - Data Engineer"),
    )
    assert len(ashby.invites) == 1
    assert await count(sessions, User, User.email == EMAIL) == 1
    candidate = await candidate_by_email(sessions, EMAIL)
    assert await count(sessions, Application, Application.candidate_id == candidate.id) == 2


async def test_existing_signed_in_candidate_gets_no_new_account(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    """Sophia already signs in. Applying through Ashby (in different casing) links her record."""
    await deliver(anonymous, application_event(email="Sophia.Martinez@Example.com", name="Sophia Martinez"))
    sophia = await candidate_by_email(sessions, SOPHIA_EMAIL)
    assert sophia.id == uuid.UUID(candidate_id("sophia-martinez"))  # the same record, not a new one
    assert sophia.external_id is not None
    assert ashby.invites == []
    assert sophia.portal_status in ("invited", "active")
    assert await count(sessions, User, User.email == SOPHIA_EMAIL) == 1
    assert await count(sessions, Candidate, Candidate.email == SOPHIA_EMAIL) == 1


async def test_existing_talent_bridge_candidate_is_linked_not_duplicated(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    james = "james.park@example.com"  # in the pipeline, never signed in
    before = await candidate_by_email(sessions, james)
    await deliver(anonymous, application_event(email="  JAMES.PARK@example.com", name="James Park"))
    after = await candidate_by_email(sessions, james)
    assert after.id == before.id and after.external_id is not None
    assert await count(sessions, Candidate, Candidate.email == james) == 1
    assert await count(sessions, Application, Application.candidate_id == after.id) == 2  # his own and the new one
    assert [invite["email"] for invite in ashby.invites] == [james]


async def test_an_existing_supabase_account_is_linked_not_recreated(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = uuid.uuid4()

    async def found(session: AsyncSession, *, email: str | None = None, auth_user_id: uuid.UUID | None = None) -> AuthAccount:
        return AuthAccount(id=existing, email=EMAIL, email_verified=True)

    monkeypatch.setattr(account_provisioning, "find_auth_account", found)
    await deliver(anonymous, application_event())
    assert ashby.invites == []  # never a second account
    candidate = await candidate_by_email(sessions, EMAIL)
    async with sessions() as session:
        user = await session.get(User, candidate.user_id)
    assert user is not None and user.auth_user_id == existing
    assert candidate.portal_status == "invited"


async def test_an_unconfirmed_supabase_account_is_left_to_confirm(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    ashby: FakeSupabaseAdmin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def found(session: AsyncSession, **_: object) -> AuthAccount:
        return AuthAccount(id=uuid.uuid4(), email=EMAIL, email_verified=False)

    monkeypatch.setattr(account_provisioning, "find_auth_account", found)
    await deliver(anonymous, application_event())
    candidate = await candidate_by_email(sessions, EMAIL)
    # Not linked until they prove the address is theirs (account_service links them then).
    assert candidate.user_id is None and candidate.portal_status == "invited"
    assert ashby.invites == []


async def test_supabase_reporting_an_existing_user_creates_no_duplicate(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    ashby.existing.add(EMAIL)
    await deliver(anonymous, application_event())
    candidate = await candidate_by_email(sessions, EMAIL)
    assert candidate.portal_status == "invited" and candidate.portal_invite_error is None
    assert ashby.invites == []


async def test_invitation_failure_keeps_the_application_and_can_be_retried(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    ashby.failures = 1
    response = await deliver(anonymous, application_event())
    assert response.json()["status"] == "processed"  # the import never depends on the email
    candidate = await candidate_by_email(sessions, EMAIL)
    assert candidate.portal_status == "invite_failed"
    assert candidate.portal_invite_error == "Supabase Auth returned HTTP 500."
    assert await count(sessions, Application, Application.candidate_id == candidate.id) == 1

    status = (await client.get(f"{API}/integrations/ashby/status")).json()
    assert status["invitations_failed"] == 1

    retried = await client.post(f"{API}/candidates/{candidate.id}/portal-invite")
    assert retried.status_code == 200
    assert retried.json()["status"] == "invited" and retried.json()["problem"] is None
    assert len(ashby.invites) == 1
    assert await count(sessions, Candidate, Candidate.email == EMAIL) == 1
    assert await count(sessions, Application, Application.candidate_id == candidate.id) == 1
    assert await count(sessions, User, User.email == EMAIL) == 1

    # Retrying an invited candidate sends nothing more.
    again = await client.post(f"{API}/candidates/{candidate.id}/portal-invite")
    assert again.json()["status"] == "invited" and len(ashby.invites) == 1


async def test_unconfigured_invitations_wait_and_are_sent_later(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    app.dependency_overrides[get_supabase_admin] = lambda: None
    await deliver(anonymous, application_event())
    candidate = await candidate_by_email(sessions, EMAIL)
    assert candidate.portal_status == "pending_invitation"
    assert "SUPABASE_SECRET_KEY" in (candidate.portal_invite_error or "")

    admin = FakeSupabaseAdmin()
    counts = await account_provisioning.retry_pending_invitations(sessions, admin)  # type: ignore[arg-type]
    assert counts == {"invited": 1}
    assert [invite["email"] for invite in admin.invites] == [EMAIL]


async def test_staff_email_is_never_given_a_candidate_sign_in(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    async with sessions() as session:
        session.add(User(email="hannah.lee@encord.example", full_name="Hannah Lee", role="recruiter"))
        await session.commit()
    await deliver(anonymous, application_event(email="hannah.lee@encord.example", name="Hannah Lee"))
    candidate = await candidate_by_email(sessions, "hannah.lee@encord.example")
    assert candidate.portal_status == "invite_failed" and candidate.user_id is None
    assert "staff account" in (candidate.portal_invite_error or "")
    assert ashby.invites == []


async def test_an_invitation_in_flight_is_not_sent_twice(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    app.dependency_overrides[get_supabase_admin] = lambda: None
    await deliver(anonymous, application_event())
    candidate = await candidate_by_email(sessions, EMAIL)
    async with sessions() as session:
        assert await account_provisioning._claim(session, candidate.id) is True
        assert await account_provisioning._claim(session, candidate.id) is False  # leased
        row = await session.get(Candidate, candidate.id, populate_existing=True)
        assert row is not None
        row.portal_invite_attempted_at = utcnow() - account_provisioning.INVITE_LEASE - timedelta(seconds=1)
        await session.commit()
        assert await account_provisioning._claim(session, candidate.id) is True  # the lease ran out

    admin = FakeSupabaseAdmin()
    async with sessions() as session:
        row = await session.get(Candidate, candidate.id, populate_existing=True)
        assert row is not None
        row.portal_invite_attempted_at = None
        await session.commit()
        status = await provision_portal_account(session, candidate.id, admin)  # type: ignore[arg-type]
        assert status == "invited"
        assert await provision_portal_account(session, candidate.id, admin) == "invited"  # type: ignore[arg-type]
    assert len(admin.invites) == 1


async def test_first_portal_visit_activates_the_account(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], ashby: FakeSupabaseAdmin
) -> None:
    await deliver(anonymous, application_event())
    taylor = bearer(ashby.users[EMAIL])
    me = await anonymous.get(f"{API}/candidate/me", headers=taylor)
    assert me.status_code == 200
    assert me.json()["candidate"]["email"] == EMAIL
    assert [item["job_title"] for item in me.json()["applications"]] == ["TEST - ML Engineer"]
    candidate = await candidate_by_email(sessions, EMAIL)
    assert candidate.portal_status == "active" and candidate.portal_activated_at is not None

    # The recruiter sees it on the pipeline row.
    rows = (await client.get(f"{API}/candidates", params={"search": "Taylor"})).json()["items"]
    assert rows[0]["candidate"]["portal_status"] == "active"
    assert rows[0]["origin"] == "ashby"
    # Who someone is comes from their users row, never from anything they send.
    assert (await anonymous.get(f"{API}/candidates", headers=taylor)).status_code == 403
