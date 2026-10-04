"""Development only: demo jobs for recruiters, and the AI job writer that drafts their postings. Mounted by
router.py behind require_demo_enabled, then require_recruiter."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.schemas.demo import DemoJobCreate, DemoJobRead, DemoJobUpdate, GeneratedJobPosting, JobPostingBrief
from app.services import demo_jobs

router = APIRouter(tags=["demo"])


@router.get("/demo/jobs", response_model=list[DemoJobRead], summary="List demo jobs")
async def list_demo_jobs(session: SessionDep) -> list[DemoJobRead]:
    """Newest first."""
    return await demo_jobs.list_demo_jobs(session)


@router.post("/demo/jobs", response_model=DemoJobRead, status_code=201, summary="Create a demo job")
async def create_demo_job(body: DemoJobCreate, session: SessionDep, user: RecruiterDep) -> DemoJobRead:
    """Always a draft. Publishing it is a separate step."""
    return await demo_jobs.create_demo_job(session, body, user)


# Before the /demo/jobs/{job_id} routes.
@router.post("/demo/jobs/generate", response_model=GeneratedJobPosting, summary="Draft a job posting with AI")
async def generate_job_posting(body: JobPostingBrief, provider: AIProviderDep) -> GeneratedJobPosting:
    """A draft for the recruiter to review and edit. Nothing is saved, and nothing is published until the
    recruiter publishes it."""
    return await demo_jobs.write_posting(body, provider)


@router.get("/demo/jobs/{job_id}", response_model=DemoJobRead, summary="Get a demo job")
async def get_demo_job(job_id: UUID, session: SessionDep) -> DemoJobRead:
    return await demo_jobs.get_demo_job(session, job_id)


@router.patch("/demo/jobs/{job_id}", response_model=DemoJobRead, summary="Update a demo job")
async def update_demo_job(job_id: UUID, body: DemoJobUpdate, session: SessionDep) -> DemoJobRead:
    """Only the fields sent are changed. A published posting must stay complete enough to publish."""
    return await demo_jobs.update_demo_job(session, job_id, body)


@router.post("/demo/jobs/{job_id}/publish", response_model=DemoJobRead, summary="Publish a demo job")
async def publish_demo_job(job_id: UUID, session: SessionDep) -> DemoJobRead:
    """Lists it on the demo careers site and opens the job."""
    return await demo_jobs.publish(session, job_id)


@router.post("/demo/jobs/{job_id}/unpublish", response_model=DemoJobRead, summary="Unpublish a demo job")
async def unpublish_demo_job(job_id: UUID, session: SessionDep) -> DemoJobRead:
    """Takes it off the careers site. The job stays open for whoever already applied."""
    return await demo_jobs.unpublish(session, job_id)


@router.post("/demo/jobs/{job_id}/close", response_model=DemoJobRead, summary="Close a demo job")
async def close_demo_job(job_id: UUID, session: SessionDep) -> DemoJobRead:
    """Takes it off the careers site and closes the job. Existing applications are kept."""
    return await demo_jobs.close(session, job_id)
