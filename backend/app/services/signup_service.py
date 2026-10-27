"""Accounts people make for themselves on the Kavuntra website: a candidate's, or an employer's
workspace.

Supabase Auth holds the password and verifies the email address; nothing here ever sees a password.
The only proof accepted is a verified address (account_service.find_auth_account): someone who followed
the link Supabase emailed them. Until then they can create nothing.

One email is one kind of account, so candidate and employer accounts are never mixed up:

- A candidate account is the candidate record with that email, linked to the sign-in. If they had
  already applied somewhere with it, that record is theirs, with every application on it; otherwise a
  new one starts with none. Nothing here creates an application.
- An employer's account is a users row with the admin role in a new company of their own: their
  workspace, empty, in the mode they chose. It never sees anything of any other company's. Someone their
  company already added (a users row with a company, not yet signed in) is linked to that workspace as they
  are instead: setting up never moves anyone out of their company or changes their role.
- An address that is already the other kind is refused with a plain explanation.
"""

import logging
import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PortalAccountStatus, UserRole
from app.core.errors import ConflictError, ForbiddenError
from app.core.security import TokenClaims
from app.models import Candidate, Company, User
from app.schemas.accounts import AccountStatus, CandidateSignup, WorkspaceSetup
from app.services import account_service
from app.services.account_service import AccountLinkError, AuthAccount

logger = logging.getLogger(__name__)

NOT_VERIFIED = "Verify your email address first: open the link we sent you, then try again."
STAFF_EMAIL = "This email belongs to an employer account. Use a personal email address for your candidate account."
CANDIDATE_EMAIL = "This email belongs to a candidate account. Use your work email address for your company's workspace."
LINKED_ELSEWHERE = "This email is already linked to another sign-in. Contact Kavuntra support."


async def status(session: AsyncSession, claims: TokenClaims) -> AccountStatus:
    account = await account_service.find_auth_account(session, auth_user_id=claims.subject)
    user = await session.scalar(select(User).where(User.auth_user_id == claims.subject))
    kind = "none" if user is None else "candidate" if user.role == UserRole.CANDIDATE else "staff"
    company = await session.get(Company, user.company_id) if user is not None and user.company_id else None
    return AccountStatus(
        email=account.email if account else claims.email,
        email_verified=bool(account and account.email_verified),
        account=kind,  # type: ignore[arg-type]
        workspace_mode=company.workspace_mode if company else None,
    )


async def create_candidate(session: AsyncSession, claims: TokenClaims, data: CandidateSignup) -> User:
    """The signed-in person's candidate account. Idempotent: asking twice returns the same one."""
    account = await _verified(session, claims)
    existing = await session.scalar(select(User).where(User.auth_user_id == account.id))
    if existing is not None:
        if existing.role != UserRole.CANDIDATE:
            raise ConflictError(STAFF_EMAIL, code="staff_email")
        return existing
    holder = await session.scalar(select(User).where(User.email == account.email))
    if holder is not None and holder.role != UserRole.CANDIDATE:
        raise ConflictError(STAFF_EMAIL, code="staff_email")

    candidate = await session.scalar(select(Candidate).where(Candidate.email == account.email))
    if candidate is None:
        # Their first portal visit makes them active, as for anyone else.
        session.add(
            Candidate(
                first_name=data.first_name,
                last_name=data.last_name,
                email=account.email,
                portal_status=PortalAccountStatus.INVITED,
            )
        )
        try:
            await session.flush()
        except IntegrityError:  # the same sign-up, twice at once: the other one made it
            await session.rollback()
    try:
        user = await account_service.link_account(session, account.email, account.id)
    except AccountLinkError as exc:
        await session.rollback()
        raise ConflictError(LINKED_ELSEWHERE, code="account_conflict") from exc
    logger.info("accounts.candidate_created user=%s existing_record=%s", user.id, candidate is not None)
    return user


async def create_workspace(session: AsyncSession, claims: TokenClaims, data: WorkspaceSetup) -> User:
    """A new company workspace with the signed-in person as its admin. Asking again once it exists returns
    the same account; it never makes a second company."""
    account = await _verified(session, claims)
    user = await session.scalar(select(User).where(User.auth_user_id == account.id))
    if user is not None and user.role == UserRole.CANDIDATE:
        raise ConflictError(CANDIDATE_EMAIL, code="candidate_email")
    if user is not None and user.company_id is not None:
        return user
    if await session.scalar(select(Candidate.id).where(Candidate.email == account.email)):
        raise ConflictError(CANDIDATE_EMAIL, code="candidate_email")
    holder = user or await session.scalar(select(User).where(User.email == account.email))
    if holder is not None and (holder.role == UserRole.CANDIDATE or holder.auth_user_id not in (None, account.id)):
        raise ConflictError(LINKED_ELSEWHERE, code="account_conflict")
    if holder is not None and holder.company_id is not None:  # added by their company: that's their workspace
        holder.auth_user_id = account.id
        await session.commit()
        logger.info("accounts.workspace_joined user=%s company=%s", holder.id, holder.company_id)
        return holder

    company = Company(
        slug=await _unique_slug(session, data.company_name),
        name=data.company_name,
        workspace_mode=data.mode,
        locations=[data.location] if data.location else [],
        source="Set up by its admin on the Kavuntra website",
    )
    session.add(company)
    await session.flush()
    if holder is None:
        holder = User(email=account.email, full_name=data.full_name, role=UserRole.ADMIN)
        session.add(holder)
    holder.full_name = holder.full_name or data.full_name
    holder.role = UserRole.ADMIN
    holder.auth_user_id = account.id
    holder.company_id = company.id
    await session.commit()
    logger.info("accounts.workspace_created company=%s mode=%s", company.id, company.workspace_mode)
    return holder


async def _verified(session: AsyncSession, claims: TokenClaims) -> AuthAccount:
    account = await account_service.find_auth_account(session, auth_user_id=claims.subject)
    if account is None or not account.email_verified:
        raise ForbiddenError(NOT_VERIFIED, code="email_not_verified")
    return account


async def _unique_slug(session: AsyncSession, name: str) -> str:
    """ "Sam's Cafe" is sams-cafe; a second one is sams-cafe-2."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().replace("'", "")
    base = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:50] or "company"
    taken = set(await session.scalars(select(Company.slug).where(func.lower(Company.slug).like(f"{base}%"))))
    if base not in taken:
        return base
    number = 2
    while f"{base}-{number}" in taken:
        number += 1
    return f"{base}-{number}"
