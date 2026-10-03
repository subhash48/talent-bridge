"""Jobs."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import SessionDep
from app.core.enums import JobStatus
from app.schemas.job import JobCreate, JobRead, JobUpdate
from app.services import job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobRead], summary="List jobs")
async def list_jobs(session: SessionDep, status: JobStatus | None = None) -> list[JobRead]:
    return await job_service.list_jobs(session, status=status)


@router.get("/{job_id}", response_model=JobRead, summary="Get a job")
async def get_job(job_id: UUID, session: SessionDep) -> JobRead:
    return JobRead.model_validate(await job_service.get_job(session, job_id))


@router.post("", response_model=JobRead, status_code=201, summary="Create a job")
async def create_job(body: JobCreate, session: SessionDep) -> JobRead:
    return await job_service.create_job(session, body)


@router.patch("/{job_id}", response_model=JobRead, summary="Update a job")
async def update_job(job_id: UUID, body: JobUpdate, session: SessionDep) -> JobRead:
    """Only the fields sent are changed."""
    return await job_service.update_job(session, job_id, body)
