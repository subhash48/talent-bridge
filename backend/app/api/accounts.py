"""Accounts people make for themselves: a candidate account, or an employer's workspace.

Signed in with Supabase Auth (which keeps the password and verifies the email), but not yet linked to
anything in TalentBridge, so these take a valid access token rather than a TalentBridge account.
"""

from fastapi import APIRouter

from app.api.auth import current_user_read
from app.core.dependencies import ClaimsDep, SessionDep
from app.schemas.accounts import AccountStatus, CandidateSignup, WorkspaceSetup
from app.schemas.user import CurrentUserRead
from app.services import signup_service

router = APIRouter(prefix="/accounts", tags=["auth"])


@router.get("/status", response_model=AccountStatus, summary="What this sign-in is in TalentBridge")
async def account_status(claims: ClaimsDep, session: SessionDep) -> AccountStatus:
    """Whether the email is verified, and whether it's a candidate's or an employer's account yet."""
    return await signup_service.status(session, claims)


@router.post("/candidate", response_model=CurrentUserRead, summary="Create my candidate account")
async def create_candidate_account(body: CandidateSignup, claims: ClaimsDep, session: SessionDep) -> CurrentUserRead:
    """For a verified email (403 email_not_verified until then). Any applications already made with it are
    in the portal at once; the same request again changes nothing. 409 staff_email for an employer's
    address."""
    user = await signup_service.create_candidate(session, claims, body)
    return await current_user_read(session, user)


@router.post("/workspace", response_model=CurrentUserRead, summary="Create my company's workspace")
async def create_workspace(body: WorkspaceSetup, claims: ClaimsDep, session: SessionDep) -> CurrentUserRead:
    """A new, empty workspace for a verified email, in the mode chosen (the full recruiting workspace or
    Simple Hire), with them as its admin. 409 candidate_email for a candidate's address."""
    user = await signup_service.create_workspace(session, claims, body)
    return await current_user_read(session, user)
