"""Who is making the request.

There is no login yet. Recruiter routes act as the configured recruiter (DEFAULT_USER_EMAIL) and
candidate portal routes act as the configured candidate (DEV_CANDIDATE_EMAIL). Routes already
depend on get_current_user and get_current_candidate, so adding Supabase Auth only changes this
module: read the Bearer token, verify it against the project's JWKS (SUPABASE_URL/auth/v1/
.well-known/jwks.json), and load the users row for its subject. The users row, never the token,
decides the role; a candidate's row is matched to their candidates row by email. The service role
key stays on the server and is never needed for this.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import UserRole
from app.models import Candidate, User

STAFF_ROLES = (UserRole.RECRUITER, UserRole.ADMIN)


async def resolve_current_user(session: AsyncSession) -> User | None:
    """The acting recruiter: the configured user, else the first staff account, else nobody."""
    user = await session.scalar(select(User).where(User.email == settings.default_user_email.lower()))
    if user is not None:
        return user
    return await session.scalar(select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.created_at).limit(1))


async def resolve_current_candidate(session: AsyncSession) -> Candidate | None:
    """The candidate using the portal: the DEV_CANDIDATE_EMAIL candidate until sign-in exists."""
    return await session.scalar(select(Candidate).where(Candidate.email == settings.dev_candidate_email.lower()))
