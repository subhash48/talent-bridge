"""The Hirvello job board: public, no sign-in. Every employer's open public jobs, searching them, and applying
with a name, an email and a résumé; the applicant gets their candidate portal link by email. (Signed-in
candidates apply from the portal's own route: POST /candidate/jobs/{id}/apply.)"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.core.dependencies import EmailProviderDep, SessionDep, SupabaseAdminDep
from app.core.rate_limit import client_address
from app.schemas.careers import (
    ApplicationCreate,
    ApplicationResult,
    CareerJobDetail,
    CareerJobSummary,
    JobBoardPage,
    JobBoardQuery,
)
from app.services import careers

router = APIRouter(prefix="/careers", tags=["careers"])


@router.get("/jobs", response_model=list[CareerJobSummary], summary="Open roles")
async def list_jobs(session: SessionDep) -> list[CareerJobSummary]:
    """Every job on the board, newest first."""
    return await careers.list_jobs(session)


@router.get("/search", response_model=JobBoardPage, summary="Search the job board")
async def search(query: Annotated[JobBoardQuery, Query()], session: SessionDep) -> JobBoardPage:
    """One page of matching jobs, newest first, with how many each tab (all, recruiter, small business) has
    under the same filters. 422 on a filter value it doesn't know."""
    return await careers.search(session, query)


@router.get("/jobs/{job_id}", response_model=CareerJobDetail, summary="A role")
async def get_job(job_id: UUID, session: SessionDep) -> CareerJobDetail:
    """404 job_not_found unless the job is on the board."""
    return await careers.get_job(session, job_id)


@router.post("/jobs/{job_id}/apply", response_model=ApplicationResult, summary="Apply for a role")
async def apply(
    job_id: UUID,
    body: ApplicationCreate,
    request: Request,
    session: SessionDep,
    admin: SupabaseAdminDep,
    email: EmailProviderDep,
) -> ApplicationResult:
    """The application is created straight away, with the résumé, and the applicant is emailed a link
    into their candidate portal: to create their password, or to sign in if they have an account. 404
    job_not_found, 409 job_closed (closed, or past its closing date), 422 invalid_resume, email_not_accepted or
    availability_required, 429 too_many_applications after ten in ten minutes from one address."""
    careers.limiter.check(client_address(request))
    return await careers.apply(session, job_id, body, admin, email)
