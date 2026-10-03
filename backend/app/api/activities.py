"""The application timeline."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.dependencies import SessionDep
from app.schemas.activity import ActivityRead
from app.services import activity_service

router = APIRouter(prefix="/applications", tags=["activity"])


@router.get("/{application_id}/activity", response_model=list[ActivityRead], summary="Timeline")
async def list_activity(
    application_id: UUID,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ActivityRead]:
    """Newest first."""
    return await activity_service.list_activity(session, application_id, limit=limit, offset=offset)
