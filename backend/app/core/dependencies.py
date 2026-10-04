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

from fastapi import BackgroundTasks, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import get_session, get_session_factory
from app.core.enums import STAFF_ROLES, UserRole
from app.core.errors import ForbiddenError, NotFoundError, ServiceUnavailableError, UnauthorizedError
from app.core.security import InvalidTokenError, TokenClaims, TokenVerifier, get_token_verifier
from app.integrations.ashby.client import AshbyClient, get_ashby_client
from app.integrations.supabase_admin import SupabaseAdmin, get_supabase_admin
from app.models import Candidate, User
from app.services import demo_careers
from app.services.account_provisioning import mark_portal_active
from app.services.account_service import user_for_auth_account
from app.services.ai.client import AIProvider, get_ai_provider

logger = logging.getLogger(__name__)

AUTHENTICATION_REQUIRED = "Authentication required."
NO_PERMISSION = "You do not have permission to access this resource."

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))]
VerifierDep = Annotated[TokenVerifier | None, Depends(get_token_verifier)]
AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]


async def get_current_user(
    request: Request, session: SessionDep, credentials: BearerDep, verifier: VerifierDep
) -> User:
    """The signed-in person, from their verified access token and their users row."""
    return await _signed_in_user(request, session, await _verify_token(credentials, verifier))


async def get_current_user_submitting_demo(
    request: Request,
    session: SessionDep,
    credentials: BearerDep,
    verifier: VerifierDep,
    factory: SessionFactoryDep,
    background: BackgroundTasks,
    provider: AIProviderDep,
) -> User:
    """get_current_user for GET /me, which the frontend calls after every sign-in. When the demo
    careers site is on (development only), it first submits the applications waiting for this
    sign-in: signing in as the email they applied with is what proves they're the applicant."""
    claims = await _verify_token(credentials, verifier)
    if settings.ashby_demo_enabled:  # never in production, whose database has no demo tables
        await demo_careers.submit_on_sign_in(factory, claims, background=background, provider=provider)
    return await _signed_in_user(request, session, claims)


async def _verify_token(
    credentials: HTTPAuthorizationCredentials | None, verifier: TokenVerifier | None
) -> TokenClaims:
    """Who a valid access token says the caller is. 401 without one, 503 when sign-in isn't set up."""
    if credentials is None:
        raise UnauthorizedError(AUTHENTICATION_REQUIRED)
    if verifier is None:
        logger.error("SUPABASE_URL isn't set, so access tokens can't be verified and nobody can sign in.")
        raise ServiceUnavailableError("Sign-in isn't available right now.", code="auth_not_configured")
    try:
        return await verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        logger.info("Rejected an access token: %s", exc)
        raise UnauthorizedError(AUTHENTICATION_REQUIRED) from None


async def _signed_in_user(request: Request, session: AsyncSession, claims: TokenClaims) -> User:
    """The users row the token's account is linked to. 403 when there's none or it may not sign in."""
    user = await user_for_auth_account(session, claims.subject)
    if user is None:
        raise ForbiddenError(
            "Your account isn't linked to Talent Bridge yet. Contact the hiring team.", code="account_not_linked"
        )
    if user.disabled_at is not None:
        raise ForbiddenError("This account has been disabled.", code="account_disabled")
    # A candidate is linked by the email they applied with, and only ever signs in as that address.
    # A sign-in whose email has since changed in Supabase no longer proves it's them.
    if user.role == UserRole.CANDIDATE and claims.email and claims.email.strip().lower() != user.email:
        logger.warning("Refused a candidate sign-in whose email doesn't match its record: user=%s", user.id)
        raise ForbiddenError(
            "This sign-in doesn't match the email on your candidate record. Contact the hiring team.",
            code="account_mismatch",
        )
    # The Supabase Auth session the token belongs to, so a portal login is counted once per sign-in.
    request.state.auth_session_id = claims.session_id
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
    await mark_portal_active(session, candidate)  # their first visit activates the invitation
    return candidate


CurrentCandidateDep = Annotated[Candidate, Depends(get_current_candidate)]


def require_demo_enabled() -> None:
    """The development-only demo routes answer 404, as if they didn't exist, unless ENABLE_ASHBY_DEMO
    is true outside production. Checked before sign-in, so production refuses them to everyone."""
    if not settings.ashby_demo_enabled:
        raise NotFoundError("This endpoint doesn't exist.")


AshbyClientDep = Annotated[AshbyClient | None, Depends(get_ashby_client)]
SupabaseAdminDep = Annotated[SupabaseAdmin | None, Depends(get_supabase_admin)]
