"""Candidate portal accounts for people who apply through Ashby.

An Ashby applicant gets portal access at the email they applied with, without anyone choosing a
password for them:

1. A candidate already linked to a sign-in keeps it.
2. An existing Supabase Auth account for the address is reused, never duplicated. If its owner has
   confirmed the address it is linked now; otherwise account_service links it once they confirm.
3. Otherwise Supabase emails them an invitation (a one-time link to choose their own password), and
   the new account is linked to their candidate record straight away. Only the inbox owner can use
   the link, so linking before they accept gives nobody else access.

This runs after the import has committed, so a failure here never loses an application: the
candidate is marked invite_failed with a safe reason, and the reconciliation sync or a recruiter
retries it. A short lease on the candidate row makes sure two deliveries racing each other send one
invitation, and Supabase refuses a second account for the same address anyway.
"""

import logging
import uuid
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import ActivityType, PortalAccountStatus, UserRole
from app.integrations.supabase_admin import AuthUserExists, SupabaseAdmin, SupabaseAdminError
from app.models import Application, Candidate, User
from app.models.base import utcnow
from app.services.account_service import AccountLinkError, AuthAccount, find_auth_account, link_account
from app.services.activity_service import record_activity

logger = logging.getLogger(__name__)

P = PortalAccountStatus
INVITE_LEASE = timedelta(minutes=2)  # an attempt in flight; a crashed one can be retried after this
MAX_AUTOMATIC_ATTEMPTS = 5  # the sync stops retrying after this; a recruiter can still retry
NOT_CONFIGURED = "Portal invitations aren't set up yet: add SUPABASE_SECRET_KEY to backend/.env."


async def provision_portal_account(
    session: AsyncSession, candidate_id: uuid.UUID, admin: SupabaseAdmin | None
) -> PortalAccountStatus | None:
    """Give the candidate portal access if they should have it. Commits. Returns their status."""
    candidate = await _load(session, candidate_id)
    if candidate is None:
        return None
    if candidate.portal_status not in (P.PENDING_INVITATION, P.INVITE_FAILED):
        return candidate.portal_status

    if candidate.user_id is not None:
        user = await session.get(User, candidate.user_id)
        if user is not None and user.auth_user_id is not None:
            return await _settle(session, candidate, P.INVITED, note="already has a sign-in")

    holder = await session.scalar(select(User).where(User.email == candidate.email))
    if holder is not None and holder.role != UserRole.CANDIDATE:
        return await _settle(
            session, candidate, P.INVITE_FAILED, error="This email belongs to a staff account, so it isn't invited."
        )

    account = await find_auth_account(session, email=candidate.email)
    if account is not None:
        return await _adopt(session, candidate, account)

    if admin is None:
        candidate.portal_invite_error = NOT_CONFIGURED
        await session.commit()
        logger.warning("portal.invite_not_configured candidate=%s", candidate.id)
        return candidate.portal_status

    if not await _claim(session, candidate.id):
        return (await _load(session, candidate_id) or candidate).portal_status
    candidate = await _load(session, candidate_id)
    assert candidate is not None
    try:
        invited = await admin.invite(
            candidate.email,
            redirect_to=settings.portal_invite_redirect_url,
            data={"full_name": candidate.full_name},
        )
    except AuthUserExists:
        account = await find_auth_account(session, email=candidate.email)
        if account is not None:
            return await _adopt(session, candidate, account)
        # Supabase has an account we can't see from here: it links when its owner signs in.
        return await _settle(session, candidate, P.INVITED, note="existing account")
    except SupabaseAdminError as exc:
        return await _settle(session, candidate, P.INVITE_FAILED, error=str(exc))

    try:
        await link_account(session, candidate.email, invited.id)
    except AccountLinkError as exc:
        await session.rollback()
        candidate = await _load(session, candidate_id)
        assert candidate is not None
        return await _settle(session, candidate, P.INVITE_FAILED, error=f"Invited, but not linked: {exc}")
    candidate = await _load(session, candidate_id)
    assert candidate is not None
    candidate.portal_invited_at = utcnow()
    application_id = await session.scalar(
        select(Application.id)
        .where(Application.candidate_id == candidate.id)
        .order_by(Application.updated_at.desc())
        .limit(1)
    )
    if application_id is not None:
        record_activity(
            session,
            application_id,
            ActivityType.PORTAL_INVITED,
            "Candidate portal invitation sent",
        )
    return await _settle(session, candidate, P.INVITED, note="invitation sent")


async def request_invitation(session: AsyncSession, candidate: Candidate) -> None:
    """A recruiter asked for the candidate to have portal access (or to retry a failed invite)."""
    if candidate.portal_status in (P.NOT_REQUIRED, P.INVITE_FAILED):
        candidate.portal_status = P.PENDING_INVITATION
        candidate.portal_invite_attempted_at = None
        await session.commit()


async def mark_portal_active(session: AsyncSession, candidate: Candidate) -> None:
    """The candidate just used the portal. Recorded once."""
    if candidate.portal_status == P.ACTIVE and candidate.portal_activated_at is not None:
        return
    candidate.portal_status = P.ACTIVE
    candidate.portal_activated_at = candidate.portal_activated_at or utcnow()
    candidate.portal_invite_error = None
    await session.commit()


async def provision_in_background(
    session_factory: async_sessionmaker[AsyncSession], candidate_ids: Iterable[uuid.UUID], admin: SupabaseAdmin | None
) -> None:
    """For BackgroundTasks: never raises, so one failure can't affect anything else."""
    for candidate_id in candidate_ids:
        try:
            async with session_factory() as session:
                await provision_portal_account(session, candidate_id, admin)
        except Exception:
            logger.exception("portal.invite_crashed candidate=%s", candidate_id)


async def retry_pending_invitations(
    session_factory: async_sessionmaker[AsyncSession], admin: SupabaseAdmin | None, *, limit: int = 200
) -> dict[str, int]:
    """Invitations that are waiting or failed, up to MAX_AUTOMATIC_ATTEMPTS each. Counts by result."""
    async with session_factory() as session:
        ids = (
            await session.scalars(
                select(Candidate.id)
                .where(
                    Candidate.portal_status.in_([P.PENDING_INVITATION, P.INVITE_FAILED]),
                    Candidate.portal_invite_attempts < MAX_AUTOMATIC_ATTEMPTS,
                )
                .limit(limit)
            )
        ).all()
    counts: dict[str, int] = {}
    for candidate_id in ids:
        async with session_factory() as session:
            status = await provision_portal_account(session, candidate_id, admin)
        key = status.value if status else "missing"
        counts[key] = counts.get(key, 0) + 1
    return counts


async def _adopt(session: AsyncSession, candidate: Candidate, account: AuthAccount) -> PortalAccountStatus:
    """Use the Supabase account that already exists for this address instead of creating one."""
    if account.email_verified:
        try:
            await link_account(session, candidate.email, account.id)
        except AccountLinkError as exc:
            await session.rollback()
            reloaded = await _load(session, candidate.id)
            assert reloaded is not None
            return await _settle(session, reloaded, P.INVITE_FAILED, error=f"Couldn't link the existing sign-in: {exc}")
        reloaded = await _load(session, candidate.id)
        assert reloaded is not None
        candidate = reloaded
    return await _settle(session, candidate, P.INVITED, note="existing account")


async def _claim(session: AsyncSession, candidate_id: uuid.UUID) -> bool:
    """Take the lease for one invitation attempt. False if another attempt is in flight."""
    now = utcnow()
    result = await session.execute(
        update(Candidate)
        .where(
            Candidate.id == candidate_id,
            or_(
                Candidate.portal_status == P.INVITE_FAILED,
                (Candidate.portal_status == P.PENDING_INVITATION)
                & or_(
                    Candidate.portal_invite_attempted_at.is_(None),
                    Candidate.portal_invite_attempted_at < now - INVITE_LEASE,
                ),
            ),
        )
        .values(
            portal_status=P.PENDING_INVITATION,
            portal_invite_attempted_at=now,
            portal_invite_attempts=Candidate.portal_invite_attempts + 1,
        )
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return bool(result.rowcount)  # type: ignore[attr-defined]


async def _settle(
    session: AsyncSession,
    candidate: Candidate,
    status: PortalAccountStatus,
    *,
    error: str | None = None,
    note: str | None = None,
) -> PortalAccountStatus:
    if candidate.portal_status != P.ACTIVE:  # signing in in the meantime wins
        candidate.portal_status = status
    candidate.portal_invite_error = error
    await session.commit()
    log = logger.warning if error else logger.info
    log("portal.invite candidate=%s status=%s %s", candidate.id, candidate.portal_status, error or note or "")
    return candidate.portal_status


async def _load(session: AsyncSession, candidate_id: uuid.UUID) -> Candidate | None:
    return await session.get(Candidate, candidate_id, populate_existing=True)
