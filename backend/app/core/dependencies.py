"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import NotFoundError
from app.core.security import resolve_current_candidate, resolve_current_user
from app.models import Candidate, User
from app.services.ai.client import AIProvider, get_ai_provider

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(session: SessionDep) -> User | None:
    return await resolve_current_user(session)


async def get_current_candidate(session: SessionDep) -> Candidate:
    """The signed-in candidate. Every /candidate route is scoped to them and nobody else."""
    candidate = await resolve_current_candidate(session)
    if candidate is None:
        raise NotFoundError(
            "We couldn't find your candidate profile. Load the demo data with python -m app.db.seed.",
            code="candidate_not_found",
        )
    return candidate


CurrentUserDep = Annotated[User | None, Depends(get_current_user)]
CurrentCandidateDep = Annotated[Candidate, Depends(get_current_candidate)]
AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]
