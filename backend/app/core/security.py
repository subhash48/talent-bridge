"""Who is making the request.

There is no login yet, so every request acts as the configured recruiter (DEFAULT_USER_EMAIL).
Routes already depend on get_current_user, so adding Supabase Auth only changes this module:
read the Bearer token, verify it against the project's JWKS (SUPABASE_URL/auth/v1/.well-known/
jwks.json), and load the users row for its subject. The users row, never the token, decides the
role. The service role key stays on the server and is never needed for this.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import UserRole
from app.models import User

STAFF_ROLES = (UserRole.RECRUITER, UserRole.ADMIN)


async def resolve_current_user(session: AsyncSession) -> User | None:
    """The acting recruiter: the configured user, else the first staff account, else nobody."""
    user = await session.scalar(select(User).where(User.email == settings.default_user_email.lower()))
    if user is not None:
        return user
    return await session.scalar(select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.created_at).limit(1))
