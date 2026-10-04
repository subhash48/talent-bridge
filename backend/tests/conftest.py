"""Each test gets a fresh in-memory SQLite database loaded with the demo pipeline.

Sign-in works as in production, except that the access tokens are signed with a key made for the
test run instead of Supabase's: the API verifies every token with the same code. Alex Chen
(recruiter) and Sophia Martinez (candidate) have linked accounts. The `client` fixture signs each
request in as the person that portal belongs to: Sophia for /candidate/*, Alex for everything else.
Send an Authorization header to act as someone else, or use `anonymous` to send none.
"""

import os

# Settings are read on import, and real environment variables win over backend/.env.
os.environ.update(
    DATABASE_URL="sqlite+aiosqlite://",
    AI_PROVIDER="mock",
    SEED_DEMO_DATA="false",
    ENVIRONMENT="test",
)

import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import normalize_database_url, settings
from app.core.database import create_engine_for, create_tables, get_session, get_session_factory
from app.core.security import JWKSCache, TokenVerifier, get_token_verifier
from app.db.seed import load_seed, seed_id
from app.db.seed_data import RECRUITER
from app.integrations.ashby.client import get_ashby_client
from app.integrations.supabase_admin import get_supabase_admin
from app.main import app
from app.models import Base, User
from app.services.account_service import link_account
from app.services.ai.client import get_ai_provider
from app.services.ai.fallback import MockProvider
from tests.ashby_support import SECRET, FakeSupabaseAdmin

API = "/api/v1"

ISSUER = "https://test-project.supabase.co/auth/v1"
# Fixed rather than random: tests import this module as tests.conftest while pytest loads it as
# conftest, and both copies must sign with the same key. It is trusted by nothing outside the tests.
SIGNING_KEY = ec.derive_private_key(0x7A1E_B41D_6E5C_0FFEE, ec.SECP256R1())
KEY_ID = "test-signing-key"

ALEX_EMAIL = RECRUITER["email"]
SOPHIA_EMAIL = "sophia.martinez@example.com"
ALEX_AUTH = uuid.uuid5(uuid.NAMESPACE_URL, "auth:alex")
SOPHIA_AUTH = uuid.uuid5(uuid.NAMESPACE_URL, "auth:sophia")


def application_id(key: str) -> str:
    return str(seed_id("application", key))


def candidate_id(key: str) -> str:
    return str(seed_id("candidate", key))


def job_id(title: str) -> str:
    return str(seed_id("job", title))


def public_jwks(*keys: tuple[ec.EllipticCurvePrivateKey, str]) -> dict[str, Any]:
    entries = []
    for private_key, kid in keys:
        entry = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
        entries.append({**entry, "kid": kid, "alg": "ES256", "use": "sig"})
    return {"keys": entries}


class StaticJWKS(JWKSCache):
    """Supabase's signing keys, replaced by the test key. Never fetches anything."""

    def __init__(self, jwks: dict[str, Any]) -> None:
        super().__init__("https://test-project.supabase.co/auth/v1/.well-known/jwks.json")
        self._keys = {key.key_id: key for key in jwt.PyJWKSet.from_dict(jwks).keys if key.key_id}
        self._fetched_at = float("inf")


def make_token(
    subject: uuid.UUID | str,
    *,
    key: Any = SIGNING_KEY,
    kid: str = KEY_ID,
    algorithm: str = "ES256",
    expires_in: int = 3600,
    **claims: Any,
) -> str:
    """An access token shaped like Supabase's. Override any claim to make it invalid."""
    now = int(time.time())
    payload = {
        "sub": str(subject),
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + expires_in,
        "session_id": str(uuid.uuid4()),
        **claims,
    }
    return jwt.encode(payload, key, algorithm=algorithm, headers={"kid": kid})


def bearer(subject: uuid.UUID | str, **claims: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(subject, **claims)}"}


async def link(sessions: async_sessionmaker[AsyncSession], email: str) -> dict[str, str]:
    """Link a new Supabase Auth account to the person with this email; returns their auth header."""
    auth_user_id = uuid.uuid5(uuid.NAMESPACE_URL, f"auth:{email}")
    async with sessions() as session:
        await link_account(session, email, auth_user_id)
    return bearer(auth_user_id)


POSTGRES_URL = os.environ.get("TALENT_BRIDGE_TEST_POSTGRES_URL")
# The part of Supabase's auth schema the API reads (services/account_service.find_auth_account).
AUTH_SCHEMA = (
    "create schema if not exists auth",
    (
        "create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,"
        " confirmation_sent_at timestamptz, invited_at timestamptz, deleted_at timestamptz, last_sign_in_at timestamptz)"
    ),
)


async def fresh_engine() -> AsyncEngine:
    """In-memory SQLite, or with TALENT_BRIDGE_TEST_POSTGRES_URL a throwaway Postgres database whose
    tables are dropped and recreated for every test (never point it at a database you need)."""
    if not POSTGRES_URL:
        engine = create_engine_for("sqlite+aiosqlite://")
        await create_tables(engine)
        return engine
    engine = create_engine_for(normalize_database_url(POSTGRES_URL))
    async with engine.begin() as connection:
        for statement in AUTH_SCHEMA:
            await connection.execute(text(statement))
        await connection.execute(text("truncate auth.users"))
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    return engine


@pytest.fixture
async def sessions() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = await fresh_engine()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await load_seed(session)
        await link_account(session, ALEX_EMAIL, ALEX_AUTH)
        await link_account(session, SOPHIA_EMAIL, SOPHIA_AUTH)
    yield factory
    await engine.dispose()


@pytest.fixture
async def anonymous(sessions: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncClient]:
    async def session_override() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    verifier = TokenVerifier(StaticJWKS(public_jwks((SIGNING_KEY, KEY_ID))), ISSUER)
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_session_factory] = lambda: sessions  # background tasks use the test database
    app.dependency_overrides[get_ai_provider] = MockProvider
    app.dependency_overrides[get_token_verifier] = lambda: verifier
    # Never the real Ashby or Supabase: tests that need them install fakes.
    app.dependency_overrides[get_ashby_client] = lambda: None
    app.dependency_overrides[get_supabase_admin] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
async def client(anonymous: AsyncClient) -> AsyncIterator[AsyncClient]:
    async def sign_in(request: httpx.Request) -> None:
        if "Authorization" not in request.headers:
            portal = request.url.path.startswith(f"{API}/candidate/")
            request.headers["Authorization"] = f"Bearer {make_token(SOPHIA_AUTH if portal else ALEX_AUTH)}"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", event_hooks={"request": [sign_in]}
    ) as http:
        yield http


@pytest.fixture
def ashby(anonymous: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> FakeSupabaseAdmin:
    """Ashby webhooks configured with the test secret, and portal invitations going to an in-memory
    Supabase. Returns that fake, to inspect or to make fail."""
    admin = FakeSupabaseAdmin()
    monkeypatch.setattr(settings, "ashby_webhook_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "portal_invites_enabled", True)
    monkeypatch.setattr(settings, "ashby_auto_analyze", True)
    monkeypatch.setattr(settings, "ashby_stage_title_map", {})
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    return admin


async def user_by_email(sessions: async_sessionmaker[AsyncSession], email: str) -> User | None:
    async with sessions() as session:
        return await session.scalar(select(User).where(User.email == email))
