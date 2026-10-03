"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import resolve_current_user
from app.models import User
from app.services.ai.client import AIProvider, get_ai_provider

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(session: SessionDep) -> User | None:
    return await resolve_current_user(session)


CurrentUserDep = Annotated[User | None, Depends(get_current_user)]
AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]
