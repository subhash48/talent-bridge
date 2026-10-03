"""Identity and demo operations."""

from fastapi import APIRouter

from app.core.config import settings
from app.core.dependencies import CurrentUserDep, SessionDep
from app.core.errors import NotFoundError
from app.db.seed import reset_and_seed
from app.schemas.user import CurrentUserRead, UserRead

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=CurrentUserRead, summary="The signed-in recruiter")
async def me(user: CurrentUserDep) -> CurrentUserRead:
    """Until Supabase Auth is added, this is the DEFAULT_USER_EMAIL recruiter."""
    if user is None:
        raise NotFoundError("No recruiter account exists yet. Load the demo data with python -m app.db.seed.")
    return CurrentUserRead(**UserRead.model_validate(user).model_dump(), organization=settings.organization_name)


@router.post("/demo/reset", status_code=204, summary="Reset the demo data (development only)")
async def reset_demo(session: SessionDep) -> None:
    if settings.environment != "development":
        raise NotFoundError("This endpoint doesn't exist.")
    await reset_and_seed(session)
