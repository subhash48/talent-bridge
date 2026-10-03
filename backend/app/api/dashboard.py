from fastapi import APIRouter

from app.core.dependencies import SessionDep
from app.schemas.dashboard import DashboardSummary
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary, summary="Metric trends")
async def summary(session: SessionDep) -> DashboardSummary:
    return await dashboard_service.get_summary(session)
