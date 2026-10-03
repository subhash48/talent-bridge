"""Supabase Auth access tokens.

The frontend signs in with Supabase Auth and sends the session's access token as
`Authorization: Bearer <token>`. Tokens are verified here against the project's public signing keys
(SUPABASE_URL/auth/v1/.well-known/jwks.json): signature, issuer, audience, expiry and subject. Only
asymmetric algorithms are accepted, so a token signed with a shared secret is always rejected.

A verified token only says who the person is. What they may do comes from their users row
(core/dependencies.py), never from anything in the token.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

AUDIENCE = "authenticated"
ALGORITHMS = frozenset({"ES256", "RS256", "EdDSA"})
JWKS_TTL_SECONDS = 600
JWKS_MIN_REFRESH_SECONDS = 30  # an unknown kid can't make us refetch on every request
LEEWAY_SECONDS = 30


class InvalidTokenError(Exception):
    """The token can't be trusted. The reason is for logs only, never for the response."""


@dataclass(frozen=True)
class TokenClaims:
    subject: uuid.UUID  # auth.users.id
    email: str | None
    session_id: str | None


class JWKSCache:
    """The project's public signing keys, refreshed every few minutes and when a new key appears."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, kid: str) -> jwt.PyJWK:
        stale = time.monotonic() - self._fetched_at > JWKS_TTL_SECONDS
        if stale or kid not in self._keys:
            await self._refresh(force=stale)
        key = self._keys.get(kid)
        if key is None:
            raise InvalidTokenError(f"unknown signing key {kid!r}")
        return key

    async def _refresh(self, *, force: bool) -> None:
        async with self._lock:
            if not force and time.monotonic() - self._fetched_at < JWKS_MIN_REFRESH_SECONDS:
                return
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    response = await client.get(self.url)
                    response.raise_for_status()
                jwk_set = jwt.PyJWKSet.from_dict(response.json())
            except (httpx.HTTPError, ValueError, jwt.PyJWKSetError) as exc:
                logger.error("Couldn't load the Supabase signing keys from %s: %s", self.url, exc)
                if not self._keys:
                    raise InvalidTokenError("signing keys unavailable") from exc
                return  # keep verifying with the keys we have
            self._keys = {key.key_id: key for key in jwk_set.keys if key.key_id}
            self._fetched_at = time.monotonic()


class TokenVerifier:
    def __init__(self, jwks: JWKSCache, issuer: str) -> None:
        self.jwks = jwks
        self.issuer = issuer

    async def verify(self, token: str) -> TokenClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidTokenError("malformed token") from exc
        algorithm, kid = header.get("alg"), header.get("kid")
        if algorithm not in ALGORITHMS or not isinstance(kid, str):
            raise InvalidTokenError(f"unsupported algorithm {algorithm!r}")
        key = await self.jwks.get(kid)
        if key.algorithm_name != algorithm:
            raise InvalidTokenError("algorithm doesn't match the signing key")
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=AUDIENCE,
                issuer=self.issuer,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            subject = uuid.UUID(claims["sub"])
        except (jwt.PyJWTError, ValueError, TypeError) as exc:
            raise InvalidTokenError(str(exc)) from exc
        if claims.get("role") != AUDIENCE:
            raise InvalidTokenError("not a signed-in user's token")
        return TokenClaims(subject=subject, email=claims.get("email"), session_id=claims.get("session_id"))


_verifier: TokenVerifier | None = None


def get_token_verifier() -> TokenVerifier | None:
    """The verifier for the configured project, or None when SUPABASE_URL isn't set."""
    global _verifier
    if _verifier is None and settings.jwks_url and settings.jwt_issuer:
        _verifier = TokenVerifier(JWKSCache(settings.jwks_url), settings.jwt_issuer)
    return _verifier
