"""Sign-in accounts: whose Supabase Auth account a verified token is, and linking accounts to people.

A users row is linked to one Supabase Auth account (users.auth_user_id), and a candidate's users row
to their candidates row (candidates.user_id). Links are made in two ways only:

- An operator links an existing Supabase Auth account: `python -m app.db.accounts link EMAIL`. This
  is the only way anyone gets staff access, and the role is the users row's, set by us.
- A candidate who signed up themselves is linked on their first API call, but only if they proved
  they own the address (they followed the confirmation email Supabase sent them) and a candidate
  in the pipeline already has it. Nobody else gets a users row, and no application is ever created.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.models import Candidate, User

logger = logging.getLogger(__name__)


class AccountLinkError(Exception):
    pass


@dataclass(frozen=True)
class AuthAccount:
    id: uuid.UUID
    email: str
    # Confirmed by following an email Supabase sent (signup confirmation or invite). An address that
    # was only auto-confirmed proves nothing, so it never links a candidate by itself.
    email_verified: bool


async def find_auth_account(
    session: AsyncSession, *, auth_user_id: uuid.UUID | None = None, email: str | None = None
) -> AuthAccount | None:
    """The Supabase Auth account, from auth.users. Only Supabase Postgres has that schema."""
    if session.get_bind().dialect.name != "postgresql":
        return None
    column, value = ("id", auth_user_id) if auth_user_id is not None else ("lower(email)", (email or "").lower())
    row = (
        await session.execute(
            text(
                "select id, email, email_confirmed_at is not null"
                " and (confirmation_sent_at is not null or invited_at is not null) as email_verified"
                f" from auth.users where {column} = :value and deleted_at is null"
            ),
            {"value": value},
        )
    ).first()
    if row is None or not row.email:
        return None
    return AuthAccount(id=row.id, email=row.email.lower(), email_verified=bool(row.email_verified))


async def user_for_auth_account(session: AsyncSession, auth_user_id: uuid.UUID) -> User | None:
    """The users row signed in with this Supabase Auth account, linking a verified candidate first."""
    user = await session.scalar(select(User).where(User.auth_user_id == auth_user_id))
    return user or await link_verified_candidate(session, auth_user_id)


async def link_verified_candidate(session: AsyncSession, auth_user_id: uuid.UUID) -> User | None:
    account = await find_auth_account(session, auth_user_id=auth_user_id)
    if account is None or not account.email_verified:
        return None
    # A users row with this address already exists (staff, or a candidate linked to another account):
    # only an operator may decide which account it belongs to.
    if await session.scalar(select(User.id).where(User.email == account.email)):
        return None
    if not await session.scalar(select(Candidate.id).where(Candidate.email == account.email)):
        return None
    try:
        user = await link_account(session, account.email, account.id)
    except (AccountLinkError, IntegrityError):
        # A parallel request linked it first, or the records changed in between.
        await session.rollback()
        return await session.scalar(select(User).where(User.auth_user_id == auth_user_id))
    logger.info("Linked a new sign-in to candidate %s", account.email)
    return user


async def link_account(session: AsyncSession, email: str, auth_user_id: uuid.UUID) -> User:
    """Link a Supabase Auth account to the person with this email and commit.

    Staff keep the role their users row already has. A candidate without a users row gets one with
    the candidate role, linked to their candidates row.
    """
    email = email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    candidate = await session.scalar(select(Candidate).where(Candidate.email == email))
    if user is None and candidate is None:
        raise AccountLinkError(f"No recruiter or candidate in Talent Bridge uses {email}.")
    holder = await session.scalar(select(User).where(User.auth_user_id == auth_user_id))
    if holder is not None and holder is not user:
        raise AccountLinkError(f"That Supabase account is already linked to {holder.email}.")
    if user is None:
        assert candidate is not None
        user = User(email=email, full_name=candidate.full_name, role=UserRole.CANDIDATE)
        session.add(user)
    elif user.auth_user_id not in (None, auth_user_id):
        raise AccountLinkError(f"{email} is already linked to another Supabase account.")
    user.auth_user_id = auth_user_id
    await session.flush()
    if user.role == UserRole.CANDIDATE:
        if candidate is None:
            raise AccountLinkError(f"{email} has the candidate role but no candidate record.")
        if candidate.user_id not in (None, user.id):
            raise AccountLinkError(f"The candidate {email} is already linked to another user.")
        candidate.user_id = user.id
    await session.commit()
    return user
