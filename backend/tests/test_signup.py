"""Accounts people make for themselves: a candidate account, or an employer's workspace.

Supabase Auth keeps the password and sends the verification email; the API only accepts an address its
owner verified (account_service.find_auth_account, which reads auth.users on Supabase and is stood in for
here). One email is one kind of account, so a candidate's and an employer's are never mixed up.
"""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Candidate, Company, User
from app.services import account_service
from app.services.account_service import AuthAccount
from tests.conftest import ALEX_EMAIL, API, SOPHIA_EMAIL, bearer

TEST_EMAIL = "test.candidate@example.org"
JAMES_EMAIL = "james.park@example.com"  # in Encord's pipeline, with no sign-in yet


class Inbox:
    """Supabase's accounts as the API would read them: auth id -> (email, verified)."""

    def __init__(self) -> None:
        self.accounts: dict[uuid.UUID, tuple[str, bool]] = {}

    def sign_up(self, email: str, *, verified: bool = True) -> dict[str, str]:
        auth_id = uuid.uuid4()
        self.accounts[auth_id] = (email, verified)
        return bearer(auth_id, email=email)

    async def find(
        self, _session: AsyncSession, *, auth_user_id: uuid.UUID | None = None, **_: Any
    ) -> AuthAccount | None:
        if auth_user_id not in self.accounts:
            return None
        email, verified = self.accounts[auth_user_id]
        return AuthAccount(id=auth_user_id, email=email, email_verified=verified)


@pytest.fixture
def supabase(monkeypatch: pytest.MonkeyPatch) -> Inbox:
    inbox = Inbox()
    monkeypatch.setattr(account_service, "find_auth_account", inbox.find)
    return inbox


NAMES = {"first_name": "Test", "last_name": "Candidate"}
SAMS = {"full_name": "Rosie Chen", "company_name": "Rosie's Bakery", "mode": "simple", "location": "Portland, OR"}


async def test_a_new_candidate_signs_up_and_opens_their_portal(anonymous: AsyncClient, supabase: Inbox) -> None:
    token = supabase.sign_up(TEST_EMAIL)
    before = (await anonymous.get(f"{API}/accounts/status", headers=token)).json()
    assert before == {"email": TEST_EMAIL, "email_verified": True, "account": "none", "workspace_mode": None}
    assert (await anonymous.get(f"{API}/me", headers=token)).json()["error"]["code"] == "account_not_linked"

    created = await anonymous.post(f"{API}/accounts/candidate", json=NAMES, headers=token)
    assert created.status_code == 200, created.text
    me = created.json()
    assert (me["role"], me["email"], me["full_name"], me["workspace"]) == (
        "candidate",
        TEST_EMAIL,
        "Test Candidate",
        None,
    )
    assert me["candidate_id"] is not None
    portal = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
    assert portal["candidate"]["full_name"] == "Test Candidate" and portal["application"] is None
    assert (await anonymous.get(f"{API}/candidate/applications", headers=token)).json() == []
    assert (await anonymous.get(f"{API}/accounts/status", headers=token)).json()["account"] == "candidate"

    # Sent twice (a double click, a retry): still one person.
    again = await anonymous.post(f"{API}/accounts/candidate", json=NAMES, headers=token)
    assert again.status_code == 200 and again.json()["id"] == me["id"]
    # Not a recruiter: the workspace refuses them.
    assert (await anonymous.get(f"{API}/candidates", headers=token)).status_code == 403


async def test_nothing_is_created_until_the_email_is_verified(
    anonymous: AsyncClient, supabase: Inbox, sessions: async_sessionmaker[AsyncSession]
) -> None:
    token = supabase.sign_up(TEST_EMAIL, verified=False)
    for path, body in (("/accounts/candidate", NAMES), ("/accounts/workspace", SAMS)):
        refused = await anonymous.post(f"{API}{path}", json=body, headers=token)
        assert refused.status_code == 403 and refused.json()["error"]["code"] == "email_not_verified"
    assert (await anonymous.post(f"{API}/accounts/candidate", json=NAMES)).status_code == 401
    async with sessions() as session:
        assert (
            await session.scalar(select(func.count()).select_from(Candidate).where(Candidate.email == TEST_EMAIL)) == 0
        )
        assert (
            await session.scalar(select(func.count()).select_from(Company).where(Company.slug == "rosies-bakery")) == 0
        )


async def test_someone_who_already_applied_gets_their_applications(anonymous: AsyncClient, supabase: Inbox) -> None:
    """James applied before making an account: signing up with that email is his record, not a new one."""
    token = supabase.sign_up(JAMES_EMAIL)
    created = await anonymous.post(
        f"{API}/accounts/candidate", json={"first_name": "J", "last_name": "P"}, headers=token
    )
    assert created.status_code == 200
    assert created.json()["full_name"] == "James Park"  # the name he applied with
    mine = (await anonymous.get(f"{API}/candidate/applications", headers=token)).json()
    assert [item["job_title"] for item in mine] == ["ML Engineer"]


async def test_an_employer_email_is_never_a_candidate_account(anonymous: AsyncClient, supabase: Inbox) -> None:
    token = supabase.sign_up(ALEX_EMAIL)  # a second Supabase account with Alex's address
    refused = await anonymous.post(f"{API}/accounts/candidate", json=NAMES, headers=token)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "staff_email"


async def test_a_small_business_sets_up_simple_hire(
    anonymous: AsyncClient, supabase: Inbox, sessions: async_sessionmaker[AsyncSession]
) -> None:
    token = supabase.sign_up("rosie@rosiesbakery.example")
    created = await anonymous.post(f"{API}/accounts/workspace", json=SAMS, headers=token)
    assert created.status_code == 200, created.text
    me = created.json()
    assert (me["role"], me["organization"]) == ("admin", "Rosie's Bakery")
    assert {key: me["workspace"][key] for key in ("name", "mode", "location", "can_manage")} == {
        "name": "Rosie's Bakery",
        "mode": "simple",
        "location": "Portland, OR",
        "can_manage": True,
    }
    # A new, empty workspace: nobody else's applicants or jobs.
    assert (await anonymous.get(f"{API}/candidates", headers=token)).json()["total"] == 0
    assert (await anonymous.get(f"{API}/jobs", headers=token)).json() == []
    again = await anonymous.post(f"{API}/accounts/workspace", json=SAMS, headers=token)
    assert again.json()["workspace"]["id"] == me["workspace"]["id"]

    # Another business with the same name gets its own workspace.
    other = supabase.sign_up("owner@another-bakery.example")
    second = (await anonymous.post(f"{API}/accounts/workspace", json=SAMS, headers=other)).json()
    assert second["workspace"]["id"] != me["workspace"]["id"]
    async with sessions() as session:
        slugs = set(await session.scalars(select(Company.slug).where(Company.name == "Rosie's Bakery")))
        admin = await session.scalar(select(User).where(User.email == "rosie@rosiesbakery.example"))
    assert slugs == {"rosies-bakery", "rosies-bakery-2"}
    assert admin is not None and admin.full_name == "Rosie Chen"


async def test_a_recruiting_team_sets_up_the_full_workspace(anonymous: AsyncClient, supabase: Inbox) -> None:
    token = supabase.sign_up("talent@northwind.example")
    body = {"full_name": "Nadia Okafor", "company_name": "Northwind Labs", "mode": "full"}
    me = (await anonymous.post(f"{API}/accounts/workspace", json=body, headers=token)).json()
    assert (me["workspace"]["mode"], me["workspace"]["location"]) == ("full", None)
    status = (await anonymous.get(f"{API}/accounts/status", headers=token)).json()
    assert (status["account"], status["workspace_mode"]) == ("staff", "full")


async def test_a_candidate_email_is_never_an_employer_account(anonymous: AsyncClient, supabase: Inbox) -> None:
    for email in (SOPHIA_EMAIL, JAMES_EMAIL):  # with a sign-in, and without one yet
        token = supabase.sign_up(email)
        refused = await anonymous.post(f"{API}/accounts/workspace", json=SAMS, headers=token)
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "candidate_email"
