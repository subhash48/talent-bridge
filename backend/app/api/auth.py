"""Identity and demo operations."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import SessionDep, get_current_user_submitting_demo, require_recruiter
from app.core.enums import UserRole
from app.core.errors import NotFoundError
from app.db.seed import reset_and_seed
from app.models import Candidate, User
from app.schemas.user import CurrentUserRead, UserRead

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=CurrentUserRead, summary="The signed-in user")
async def me(user: Annotated[User, Depends(get_current_user_submitting_demo)], session: SessionDep) -> CurrentUserRead:
    """Who the access token belongs to and their role, which decides where the frontend sends them.
    candidate_id is the candidate's own record, for candidates only. With the demo careers site on
    (development only), signing in first submits the applications made there with this email."""
    candidate_id = None
    if user.role == UserRole.CANDIDATE:
        candidate_id = await session.scalar(select(Candidate.id).where(Candidate.user_id == user.id))
    return CurrentUserRead(
        **UserRead.model_validate(user).model_dump(), organization=settings.organization_name, candidate_id=candidate_id
    )


@router.post(
    "/demo/reset",
    status_code=204,
    dependencies=[Depends(require_recruiter)],
    summary="Reset the demo data (development only)",
)
async def reset_demo(session: SessionDep) -> None:
    """Sign-in links survive the reset, so everyone stays signed in to the same person."""
    if settings.environment != "development":
        raise NotFoundError("This endpoint doesn't exist.")
    await reset_and_seed(session)
