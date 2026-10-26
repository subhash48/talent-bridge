"""TalentBridge's careers site: public, no sign-in. Open jobs, and applying with a name, an email
and a résumé; the applicant gets their candidate portal link by email."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import EmailProviderDep, SessionDep, SupabaseAdminDep
from app.schemas.careers import ApplicationCreate, ApplicationResult, CareerJobDetail, CareerJobSummary
from app.services import careers

router = APIRouter(prefix="/careers", tags=["careers"])


@router.get("/jobs", response_model=list[CareerJobSummary], summary="Open roles")
async def list_jobs(session: SessionDep) -> list[CareerJobSummary]:
    return await careers.list_jobs(session)


@router.get("/jobs/{job_id}", response_model=CareerJobDetail, summary="A role")
async def get_job(job_id: UUID, session: SessionDep) -> CareerJobDetail:
    """404 job_not_found unless the job is open on the careers site."""
    return await careers.get_job(session, job_id)


@router.post("/jobs/{job_id}/apply", response_model=ApplicationResult, summary="Apply for a role")
async def apply(
    job_id: UUID, body: ApplicationCreate, session: SessionDep, admin: SupabaseAdminDep, email: EmailProviderDep
) -> ApplicationResult:
    """The application is created straight away, with the résumé, and the applicant is emailed a link
    into their candidate portal: to create their password, or to sign in if they have an account. 404
    job_not_found, 409 job_closed, 422 invalid_resume, email_not_accepted or availability_required."""
    return await careers.apply(session, job_id, body, admin, email)
