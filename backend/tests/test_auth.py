"""Sign-in and access control: who may call what, enforced by the API whatever the browser sends.

401: no token, or one that isn't a valid, current Supabase access token for this project.
403: a valid token whose account isn't linked, is disabled, or has the wrong role.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import get_session
from app.core.dependencies import require_admin
from app.core.enums import UserRole
from app.core.errors import register_error_handlers
from app.core.security import TokenVerifier, get_token_verifier
from app.db.seed import reset_and_seed
from app.models import Candidate, User
from app.models.base import utcnow
from app.services import account_service
from app.services.account_service import AuthAccount
from tests.conftest import (
    ALEX_AUTH,
    API,
    ISSUER,
    KEY_ID,
    SIGNING_KEY,
    SOPHIA_AUTH,
    StaticJWKS,
    application_id,
    bearer,
    candidate_id,
    link,
    make_token,
    public_jwks,
    user_by_email,
)

SOPHIA = candidate_id("sophia-martinez")
SOPHIA_APP = application_id("sophia-martinez")
JAMES = candidate_id("james-park")
JAMES_APP = application_id("james-park")
JAMES_EMAIL = "james.park@example.com"

ALEX = bearer(ALEX_AUTH)
SOPHIA_TOKEN = bearer(SOPHIA_AUTH)

CANDIDATE_ROUTES = [
    ("GET", "/candidate/me"),
    ("GET", "/candidate/application"),
    ("GET", "/candidate/activity"),
    ("GET", "/candidate/interviews"),
    ("GET", f"/candidate/interviews/{uuid.uuid4()}"),
    ("PATCH", f"/candidate/interviews/{uuid.uuid4()}/confirm"),
    ("GET", "/candidate/messages"),
    ("POST", "/candidate/messages"),
    ("POST", "/candidate/messages/read"),
    ("GET", "/candidate/profile"),
    ("PATCH", "/candidate/profile"),
    ("GET", "/candidate/prep"),
    ("POST", "/candidate/prep/viewed"),
    ("POST", "/candidate/ai/ask"),
    ("GET", "/candidate/applications"),
    ("GET", f"/candidate/applications/{uuid.uuid4()}"),
    ("POST", "/candidate/engagement/sessions"),
    ("POST", "/candidate/engagement/heartbeat"),
    ("POST", "/candidate/engagement/sessions/end"),
    ("POST", "/candidate/engagement/events"),
]

RECRUITER_ROUTES = [
    ("GET", "/candidates"),
    ("GET", f"/candidates/{JAMES}"),
    ("GET", f"/candidates/{SOPHIA}"),  # the recruiter's view of her own record: AI analysis, internal notes
    ("POST", "/candidates"),
    ("PATCH", f"/applications/{SOPHIA_APP}/stage"),
    ("POST", f"/applications/{SOPHIA_APP}/archive"),
    ("POST", f"/applications/{SOPHIA_APP}/restore"),
    ("GET", f"/applications/{SOPHIA_APP}/activity"),
    ("GET", f"/applications/{JAMES_APP}/messages"),
    ("POST", f"/applications/{JAMES_APP}/messages"),
    ("POST", f"/applications/{JAMES_APP}/messages/read"),
    ("GET", f"/applications/{JAMES_APP}/interviews"),
    ("POST", f"/applications/{JAMES_APP}/interviews"),
    ("PATCH", f"/interviews/{uuid.uuid4()}"),
    ("GET", "/interviews"),
    ("GET", "/jobs"),
    ("POST", "/jobs"),
    ("GET", "/messages/conversations"),
    ("GET", "/messages/unread-count"),
    ("GET", "/dashboard/summary"),
    ("POST", "/ai/analyze-candidate"),
    ("POST", "/ai/ask-candidate"),
    ("POST", "/ai/draft-message"),
    ("GET", f"/candidates/{SOPHIA}/engagement"),
    ("POST", f"/candidates/{SOPHIA}/portal-invite"),
    ("GET", "/integrations/ashby/status"),
    ("POST", "/integrations/ashby/sync"),
    ("POST", "/demo/reset"),
]


async def call(client: AsyncClient, method: str, path: str, headers: dict[str, str] | None = None) -> Any:
    return await client.request(method, f"{API}{path}", headers=headers, json={} if method != "GET" else None)


# 401: not signed in


@pytest.mark.parametrize(("method", "path"), [*CANDIDATE_ROUTES, *RECRUITER_ROUTES, ("GET", "/me")])
async def test_no_token_is_401(anonymous: AsyncClient, method: str, path: str) -> None:
    response = await call(anonymous, method, path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"] == {"code": "unauthorized", "message": "Authentication required.", "details": None}


async def test_health_needs_no_token(anonymous: AsyncClient) -> None:
    assert (await anonymous.get("/health")).status_code == 200


OTHER_KEY = ec.generate_private_key(ec.SECP256R1())

INVALID_TOKENS = {
    "garbage": "not-a-jwt",
    "wrong signature": make_token(SOPHIA_AUTH, key=OTHER_KEY),
    "unknown key id": make_token(SOPHIA_AUTH, kid="someone-elses-key"),
    "another project": make_token(SOPHIA_AUTH, iss="https://another-project.supabase.co/auth/v1"),
    "wrong audience": make_token(SOPHIA_AUTH, aud="anon"),
    "anon key": make_token(SOPHIA_AUTH, role="anon"),
    "shared secret": jwt.encode(
        {"sub": str(SOPHIA_AUTH), "iss": ISSUER, "aud": "authenticated", "role": "authenticated", "exp": 9999999999},
        "a-shared-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
        headers={"kid": KEY_ID},
    ),
    "unsigned": jwt.encode(
        {"sub": str(SOPHIA_AUTH), "iss": ISSUER, "aud": "authenticated", "role": "authenticated", "exp": 9999999999},
        None,
        algorithm="none",
        headers={"kid": KEY_ID},
    ),
    "subject not a uuid": make_token("sophia"),
    "expired": make_token(SOPHIA_AUTH, expires_in=-120),
}


@pytest.mark.parametrize("token", INVALID_TOKENS.values(), ids=INVALID_TOKENS.keys())
async def test_invalid_token_is_401(anonymous: AsyncClient, token: str) -> None:
    for path in ("/candidate/me", "/candidates", "/me"):
        response = await anonymous.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401, path
        assert response.json()["error"]["message"] == "Authentication required."


async def test_missing_subject_is_401(anonymous: AsyncClient) -> None:
    token = jwt.encode(
        {"iss": ISSUER, "aud": "authenticated", "role": "authenticated", "iat": 0, "exp": 9999999999},
        SIGNING_KEY,
        algorithm="ES256",
        headers={"kid": KEY_ID},
    )
    assert (await anonymous.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401


async def test_other_auth_schemes_are_401(anonymous: AsyncClient) -> None:
    token = make_token(SOPHIA_AUTH)
    for header in (token, f"Basic {token}", "Bearer "):
        assert (await anonymous.get(f"{API}/me", headers={"Authorization": header})).status_code == 401


async def test_signing_keys_are_rotated_in(anonymous: AsyncClient) -> None:
    """A token signed with a newly published key verifies once the key set includes it."""
    from app.main import app

    new_key = ec.generate_private_key(ec.SECP256R1())
    jwks = StaticJWKS(public_jwks((new_key, "rotated-key")))
    app.dependency_overrides[get_token_verifier] = lambda: TokenVerifier(jwks, ISSUER)
    response = await anonymous.get(
        f"{API}/me", headers={"Authorization": f"Bearer {make_token(ALEX_AUTH, key=new_key, kid='rotated-key')}"}
    )
    assert response.status_code == 200


async def test_sign_in_not_configured_is_503_never_open(anonymous: AsyncClient) -> None:
    from app.main import app

    app.dependency_overrides[get_token_verifier] = lambda: None
    response = await anonymous.get(f"{API}/candidate/me", headers=SOPHIA_TOKEN)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_not_configured"
    assert (await anonymous.get(f"{API}/candidate/me")).status_code == 401


# /me


async def test_me_returns_the_role_from_the_database(anonymous: AsyncClient) -> None:
    alex = (await anonymous.get(f"{API}/me", headers=ALEX)).json()
    assert (alex["full_name"], alex["role"], alex["candidate_id"]) == ("Alex Chen", "recruiter", None)
    assert alex["organization"] == "Encord"

    sophia = (await anonymous.get(f"{API}/me", headers=SOPHIA_TOKEN)).json()
    assert (sophia["full_name"], sophia["role"], sophia["candidate_id"]) == ("Sophia Martinez", "candidate", SOPHIA)
    assert sophia["email"] == "sophia.martinez@example.com"


async def test_token_claims_never_grant_a_role(anonymous: AsyncClient) -> None:
    """Supabase lets users edit their own user_metadata; the role still comes from the users row."""
    forged = {"user_metadata": {"role": "admin"}, "app_metadata": {"role": "admin"}, "user_role": "admin"}
    sophia = bearer(SOPHIA_AUTH, **forged)
    assert (await anonymous.get(f"{API}/me", headers=sophia)).json()["role"] == "candidate"
    assert (await anonymous.get(f"{API}/candidates", headers=sophia)).status_code == 403
    assert (await anonymous.get(f"{API}/me", headers=bearer(ALEX_AUTH, **forged))).json()["role"] == "recruiter"


async def test_unlinked_account_is_403(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    stranger = bearer(uuid.uuid4(), email="stranger@example.com")
    for path in ("/me", "/candidate/me", "/candidates"):
        response = await anonymous.get(f"{API}{path}", headers=stranger)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "account_not_linked"
    async with sessions() as session:
        assert await session.scalar(select(User).where(User.email == "stranger@example.com")) is None


async def test_disabled_account_is_403(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        await session.execute(update(User).where(User.auth_user_id == ALEX_AUTH).values(disabled_at=utcnow()))
        await session.commit()
    response = await anonymous.get(f"{API}/candidates", headers=ALEX)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "account_disabled"


# Candidates


async def test_candidate_sees_only_their_own_data(anonymous: AsyncClient) -> None:
    me = await anonymous.get(f"{API}/candidate/me", headers=SOPHIA_TOKEN)
    assert me.status_code == 200
    assert me.json()["candidate"]["id"] == SOPHIA
    assert me.json()["candidate"]["full_name"] == "Sophia Martinez"


async def test_candidate_sign_in_must_carry_their_email(anonymous: AsyncClient) -> None:
    """A candidate's account is linked by the email they were invited at; a token for another address is refused."""
    same = await anonymous.get(f"{API}/candidate/me", headers=bearer(SOPHIA_AUTH, email="Sophia.Martinez@Example.com"))
    assert same.status_code == 200
    other = await anonymous.get(f"{API}/candidate/me", headers=bearer(SOPHIA_AUTH, email="someone.else@example.com"))
    assert other.status_code == 403
    assert other.json()["error"]["code"] == "account_mismatch"
    # Staff accounts are linked by an operator, not by an invitation, so they aren't held to it.
    staff = await anonymous.get(f"{API}/candidates", headers=bearer(ALEX_AUTH, email="alex@elsewhere.example"))
    assert staff.status_code == 200


@pytest.mark.parametrize(("method", "path"), RECRUITER_ROUTES)
async def test_candidate_token_is_403_on_recruiter_routes(anonymous: AsyncClient, method: str, path: str) -> None:
    response = await call(anonymous, method, path, SOPHIA_TOKEN)
    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "forbidden",
        "message": "You do not have permission to access this resource.",
        "details": None,
    }


async def test_candidate_cannot_change_their_stage(client: AsyncClient) -> None:
    moved = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": "hired"}, headers=SOPHIA_TOKEN)
    assert moved.status_code == 403
    assert (await client.get(f"{API}/candidate/me")).json()["application"]["stage"] == "interview"


async def test_candidate_cannot_use_recruiter_ai(anonymous: AsyncClient) -> None:
    for path, body in (
        ("/ai/ask-candidate", {"application_id": SOPHIA_APP, "question": "Should we hire her?"}),
        ("/ai/analyze-candidate", {"application_id": SOPHIA_APP}),
        ("/ai/draft-message", {"application_id": JAMES_APP, "intent": "follow up"}),
    ):
        assert (await anonymous.post(f"{API}{path}", json=body, headers=SOPHIA_TOKEN)).status_code == 403


async def test_candidate_cannot_open_another_candidates_interview(client: AsyncClient) -> None:
    james = (await client.get(f"{API}/applications/{JAMES_APP}/interviews")).json()[0]
    assert (await client.get(f"{API}/candidate/interviews/{james['id']}")).status_code == 404
    assert (await client.patch(f"{API}/candidate/interviews/{james['id']}/confirm")).status_code == 404
    assert james["id"] not in {i["id"] for i in (await client.get(f"{API}/candidate/interviews")).json()}
    # Still unconfirmed for James.
    assert (await client.get(f"{API}/applications/{JAMES_APP}/interviews")).json()[0]["confirmed_at"] is None


async def test_candidates_never_see_each_others_messages(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    james = await link(sessions, JAMES_EMAIL)
    sent = await client.post(f"{API}/applications/{SOPHIA_APP}/messages", json={"content": "Private note for Sophia"})
    assert sent.status_code == 201

    sophias = (await client.get(f"{API}/candidate/messages")).json()["messages"]
    james_thread = (await client.get(f"{API}/candidate/messages", headers=james)).json()["messages"]
    assert "Private note for Sophia" in {m["content"] for m in sophias}
    assert "Private note for Sophia" not in {m["content"] for m in james_thread}
    assert not {m["id"] for m in sophias} & {m["id"] for m in james_thread}

    reply = await client.post(f"{API}/candidate/messages", json={"content": "From James"}, headers=james)
    assert reply.status_code == 201
    assert "From James" not in {
        m["content"] for m in (await client.get(f"{API}/candidate/messages")).json()["messages"]
    }
    james_view = (await client.get(f"{API}/applications/{JAMES_APP}/messages")).json()
    assert "From James" in {m["content"] for m in james_view}


async def test_candidate_ids_from_the_browser_are_ignored(client: AsyncClient) -> None:
    """There is no candidate id to tamper with: query strings and bodies can't pick the record."""
    me = await client.get(f"{API}/candidate/me", params={"candidate_id": JAMES, "application_id": JAMES_APP})
    assert me.json()["candidate"]["id"] == SOPHIA
    profile = await client.patch(f"{API}/candidate/profile", json={"candidate_id": JAMES, "phone": "+1 555 0100"})
    assert profile.status_code == 422


async def test_internal_recruiter_data_stays_hidden_from_candidates(client: AsyncClient) -> None:
    assert (await client.post(f"{API}/ai/analyze-candidate", json={"application_id": SOPHIA_APP})).status_code == 201
    detail = (await client.get(f"{API}/candidates/{SOPHIA}")).json()
    assert detail["ai_analysis"] is not None  # the recruiter sees it
    assert (await client.get(f"{API}/candidates/{SOPHIA}", headers=SOPHIA_TOKEN)).status_code == 403
    portal = str([(await client.get(f"{API}/candidate/{p}")).json() for p in ("me", "application", "activity")])
    assert "ai_analysis" not in portal and detail["ai_analysis"]["summary"] not in portal


# Recruiters and admins


@pytest.mark.parametrize(
    "path", ["/candidates", f"/candidates/{SOPHIA}", "/jobs", "/interviews", "/messages/conversations", "/me"]
)
async def test_recruiter_can_use_the_workspace(anonymous: AsyncClient, path: str) -> None:
    assert (await anonymous.get(f"{API}{path}", headers=ALEX)).status_code == 200


@pytest.mark.parametrize(("method", "path"), CANDIDATE_ROUTES)
async def test_recruiter_token_is_403_on_candidate_routes(anonymous: AsyncClient, method: str, path: str) -> None:
    assert (await call(anonymous, method, path, ALEX)).status_code == 403


async def test_recruiter_cannot_make_themselves_admin(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Nothing accepts a role: extra fields are refused or ignored, and the users row is unchanged."""
    created = await client.post(
        f"{API}/candidates",
        json={"first_name": "Role", "last_name": "Test", "email": "role.test@example.com", "role": "admin"},
    )
    assert created.status_code in (201, 422)
    for method, path in (("PATCH", "/me"), ("POST", "/me"), ("PUT", "/me")):
        assert (await client.request(method, f"{API}{path}", json={"role": "admin"})).status_code == 405
    assert (await client.get(f"{API}/me")).json()["role"] == "recruiter"
    alex = await user_by_email(sessions, "alex.chen@encord.example")
    assert alex is not None and alex.role == UserRole.RECRUITER


def admin_app(sessions: async_sessionmaker[AsyncSession]) -> FastAPI:
    """require_admin guards no public route yet, so it's exercised on a route of its own."""
    from app.main import app as main_app

    test_app = FastAPI()
    register_error_handlers(test_app)

    @test_app.get("/admin-only", dependencies=[Depends(require_admin)])
    async def admin_only() -> dict[str, bool]:
        return {"ok": True}

    async def session_override() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    test_app.dependency_overrides[get_session] = session_override
    test_app.dependency_overrides[get_token_verifier] = main_app.dependency_overrides[get_token_verifier]
    return test_app


async def test_require_admin(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        session.add(User(email="ada.admin@encord.example", full_name="Ada Admin", role=UserRole.ADMIN))
        await session.commit()
    ada = await link(sessions, "ada.admin@encord.example")

    async with AsyncClient(transport=ASGITransport(app=admin_app(sessions)), base_url="http://test") as http:
        assert (await http.get("/admin-only", headers=ada)).status_code == 200
        assert (await http.get("/admin-only", headers=ALEX)).status_code == 403
        assert (await http.get("/admin-only", headers=SOPHIA_TOKEN)).status_code == 403
        assert (await http.get("/admin-only")).status_code == 401

    # Admins can use the recruiter workspace, but have no candidate portal.
    assert (await anonymous.get(f"{API}/candidates", headers=ada)).status_code == 200
    assert (await anonymous.get(f"{API}/me", headers=ada)).json()["role"] == "admin"
    assert (await anonymous.get(f"{API}/candidate/me", headers=ada)).status_code == 403


# Linking accounts


def verified(email: str, confirmed: bool = True) -> Any:
    """Stands in for reading auth.users, which only Supabase Postgres has."""

    async def find(_session: AsyncSession, *, auth_user_id: uuid.UUID, **_: Any) -> AuthAccount:
        return AuthAccount(id=auth_user_id, email=email, email_verified=confirmed)

    return find


async def test_verified_candidate_signup_links_to_their_record(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(account_service, "find_auth_account", verified(JAMES_EMAIL))
    james = bearer(uuid.uuid4(), email=JAMES_EMAIL)
    me = (await anonymous.get(f"{API}/me", headers=james)).json()
    assert (me["role"], me["candidate_id"], me["full_name"]) == ("candidate", JAMES, "James Park")
    portal = (await anonymous.get(f"{API}/candidate/me", headers=james)).json()
    assert portal["candidate"]["id"] == JAMES

    async with sessions() as session:
        candidate = await session.get(Candidate, uuid.UUID(JAMES))
        assert candidate is not None and candidate.user_id is not None


@pytest.mark.parametrize(
    ("email", "confirmed"),
    [
        (JAMES_EMAIL, False),  # auto-confirmed, or not confirmed yet: no proof they own the address
        ("alex.chen@encord.example", True),  # staff are never linked automatically
        ("sophia.martinez@example.com", True),  # already linked to another account
        ("new.person@example.com", True),  # not in the pipeline: nothing is created
    ],
)
async def test_signup_without_a_safe_match_is_not_linked(
    anonymous: AsyncClient,
    sessions: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    email: str,
    confirmed: bool,
) -> None:
    monkeypatch.setattr(account_service, "find_auth_account", verified(email, confirmed))
    response = await anonymous.get(f"{API}/me", headers=bearer(uuid.uuid4(), email=email))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "account_not_linked"
    async with sessions() as session:
        users = (await session.scalars(select(User.email))).all()
        assert sorted(users) == ["alex.chen@encord.example", "sophia.martinez@example.com"]


async def test_demo_reset_keeps_sign_in_links(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        await reset_and_seed(session)
    alex = await user_by_email(sessions, "alex.chen@encord.example")
    sophia = await user_by_email(sessions, "sophia.martinez@example.com")
    assert alex is not None and alex.auth_user_id == ALEX_AUTH and alex.role == UserRole.RECRUITER
    assert sophia is not None and sophia.auth_user_id == SOPHIA_AUTH and sophia.role == UserRole.CANDIDATE
    async with sessions() as session:
        assert await session.scalar(select(Candidate.user_id).where(Candidate.id == uuid.UUID(SOPHIA))) == sophia.id
