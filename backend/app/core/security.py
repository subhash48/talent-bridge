"""Authentication primitives: the request Principal and JWT verification (ARCHITECTURE.md 10.1).

The users row is authoritative for role and organization; token claims are used only for routing.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.schemas.candidate import Role


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    role: Role
    org_id: UUID | None = None  # staff
    candidate_ids: frozenset[UUID] = frozenset()  # candidate: one per organization applied to
    application_ids: frozenset[UUID] = frozenset()  # candidate: precomputed scope


def verify_access_token(token: str) -> dict[str, Any]:
    """Verify a Supabase access token's signature and expiry, and return its claims."""
    raise NotImplementedError  # TODO: verify against Supabase JWKS (settings.supabase_jwks_url)
