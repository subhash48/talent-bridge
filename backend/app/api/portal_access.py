"""Candidate portal access, for recruiters: invite a candidate (or retry their invitation)."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import SessionDep, SupabaseAdminDep
from app.core.errors import NotFoundError
from app.models import Candidate
from app.schemas.candidate import PortalAccess
from app.services import account_provisioning

router = APIRouter(prefix="/candidates", tags=["portal access"])


@router.post("/{candidate_id}/portal-invite", response_model=PortalAccess, summary="Invite to the candidate portal")
async def invite(candidate_id: UUID, session: SessionDep, admin: SupabaseAdminDep) -> PortalAccess:
    """Send (or retry) the candidate's portal invitation. Reuses an existing sign-in for their email
    instead of creating another; never creates a password."""
    candidate = await session.get(Candidate, candidate_id)
    if candidate is None:
        raise NotFoundError("Candidate not found.")
    await account_provisioning.request_invitation(session, candidate)
    await account_provisioning.provision_portal_account(session, candidate.id, admin)
    await session.refresh(candidate)
    return PortalAccess(
        status=candidate.portal_status,
        invited_at=candidate.portal_invited_at,
        activated_at=candidate.portal_activated_at,
        problem=candidate.portal_invite_error,
    )
