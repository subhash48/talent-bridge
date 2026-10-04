"""Development only: the public demo careers site's API. No sign-in; mounted by router.py behind
require_demo_enabled, so it answers 404 unless ENABLE_ASHBY_DEMO=true outside production."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import SessionDep, SupabaseAdminDep
from app.schemas.demo import CareerApplicationCreate, CareerApplicationResult, CareerJobDetail, CareerJobSummary
from app.services import demo_careers

router = APIRouter(prefix="/demo/careers", tags=["demo careers"])


@router.get("/jobs", response_model=list[CareerJobSummary], summary="Open roles")
async def list_jobs(session: SessionDep) -> list[CareerJobSummary]:
    """The published demo jobs, most recently published first."""
    return await demo_careers.list_jobs(session)


@router.get("/jobs/{job_id}", response_model=CareerJobDetail, summary="A role")
async def get_job(job_id: UUID, session: SessionDep) -> CareerJobDetail:
    """404 job_not_found unless the job is published on the careers site."""
    return await demo_careers.get_job(session, job_id)


@router.post("/jobs/{job_id}/apply", response_model=CareerApplicationResult, summary="Apply for a role")
async def apply(
    job_id: UUID, body: CareerApplicationCreate, session: SessionDep, admin: SupabaseAdminDep
) -> CareerApplicationResult:
    """The application waits, unseen by recruiters, until the applicant proves they own the email: by
    activating the portal account an invitation creates, or signing in to the one they have. Their
    next GET /me submits it. The result says which (see CareerApplicationResult).

    404 job_not_found (not published), 409 job_closed, 422 invalid_resume or email_not_accepted, 503
    demo_unavailable (the Ashby simulator needs backend/tests).
    """
    return await demo_careers.apply(session, job_id, body, admin)
