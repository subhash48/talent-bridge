"""FastAPI dependencies shared by the routers, including who is signed in and what they may do.

Every request but /health and the Ashby webhook carries a Supabase access token. get_current_user
verifies it and loads the users row it's linked to; the role on that row, and nothing the browser
sends, decides access:

    require_candidate  the candidate portal (/candidate/*), scoped to the caller's own record
    require_recruiter  the recruiter workspace; admins may use it too
    require_admin      reserved for admin-only operations

401 means no valid token, 403 a valid token without the right account or role.
"""

import logging
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.enums import STAFF_ROLES, UserRole
from app.core.errors import ForbiddenError, NotFoundError, ServiceUnavailableError, UnauthorizedError
from app.core.security import InvalidTokenError, TokenVerifier, get_token_verifier
from app.models import Candidate, User
from app.services.account_service import user_for_auth_account
from app.services.ai.client import AIProvider, get_ai_provider

logger = logging.getLogger(__name__)

AUTHENTICATION_REQUIRED = "Authentication required."
NO_PERMISSION = "You do not have permission to access this resource."

SessionDep = Annotated[AsyncSession, Depends(get_session)]
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))]
VerifierDep = Annotated[TokenVerifier | None, Depends(get_token_verifier)]


async def get_current_user(session: SessionDep, credentials: BearerDep, verifier: VerifierDep) -> User:
    """The signed-in person, from their verified access token and their users row."""
    if credentials is None:
        raise UnauthorizedError(AUTHENTICATION_REQUIRED)
    if verifier is None:
        logger.error("SUPABASE_URL isn't set, so access tokens can't be verified and nobody can sign in.")
        raise ServiceUnavailableError("Sign-in isn't available right now.", code="auth_not_configured")
    try:
        claims = await verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        logger.info("Rejected an access token: %s", exc)
        raise UnauthorizedError(AUTHENTICATION_REQUIRED) from None

    user = await user_for_auth_account(session, claims.subject)
    if user is None:
        raise ForbiddenError(
            "Your account isn't linked to Talent Bridge yet. Contact the hiring team.", code="account_not_linked"
        )
    if user.disabled_at is not None:
        raise ForbiddenError("This account has been disabled.", code="account_disabled")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], Awaitable[User]]:
    async def dependency(user: CurrentUserDep) -> User:
        if user.role not in roles:
            raise ForbiddenError(NO_PERMISSION)
        return user

    return dependency


require_candidate = require_role(UserRole.CANDIDATE)
require_recruiter = require_role(*STAFF_ROLES)
require_admin = require_role(UserRole.ADMIN)

RecruiterDep = Annotated[User, Depends(require_recruiter)]


async def get_current_candidate(session: SessionDep, user: Annotated[User, Depends(require_candidate)]) -> Candidate:
    """The signed-in candidate's own record. Every /candidate route is scoped to it and nothing else."""
    candidate = await session.scalar(select(Candidate).where(Candidate.user_id == user.id))
    if candidate is None:
        raise NotFoundError("We couldn't find your candidate profile.", code="candidate_not_found")
    return candidate


CurrentCandidateDep = Annotated[Candidate, Depends(get_current_candidate)]
AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]
