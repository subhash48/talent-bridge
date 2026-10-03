"""Every versioned route, mounted under /api/v1 by main.py."""

from fastapi import APIRouter

from app.api import (
    activities,
    ai,
    applications,
    auth,
    candidates,
    dashboard,
    integrations,
    interviews,
    jobs,
    messages,
)

api_router = APIRouter()
for module in (
    candidates,
    applications,
    activities,
    interviews,
    jobs,
    messages,
    ai,
    dashboard,
    auth,
    integrations,
):
    api_router.include_router(module.router)
