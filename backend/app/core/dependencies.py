"""FastAPI dependencies: the request Principal and façade guards (ARCHITECTURE.md 10.1, 10.2 L2)."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import Principal, verify_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Principal:
    """Verify the Bearer token, then build the Principal from the users row."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    verify_access_token(credentials.credentials)
    raise NotImplementedError  # TODO: load the users row and precompute the principal's scope


async def require_staff(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    """Guard for staff routes: recruiter or admin only."""
    raise NotImplementedError  # TODO: reject candidate principals


async def require_candidate(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    """Guard for /v1/portal and /v1/events: candidate only."""
    raise NotImplementedError  # TODO: reject staff principals
