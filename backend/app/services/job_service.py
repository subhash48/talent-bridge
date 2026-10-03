"""Jobs: the roles candidates apply to."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus
from app.core.errors import ConflictError, NotFoundError
from app.models import Job
from app.schemas.job import JobCreate, JobRead, JobUpdate


async def list_jobs(session: AsyncSession, *, status: JobStatus | None = None) -> list[JobRead]:
    """Newest first."""
    query = select(Job).order_by(Job.created_at.desc(), Job.title)
    if status is not None:
        query = query.where(Job.status == status)
    return [JobRead.model_validate(job) for job in await session.scalars(query)]


async def get_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    job = await session.get(Job, job_id)
    if job is None:
        raise NotFoundError("Job not found.")
    return job


async def create_job(session: AsyncSession, data: JobCreate) -> JobRead:
    if data.external_id and await session.scalar(select(Job.id).where(Job.external_id == data.external_id)):
        raise ConflictError("A job with this external id already exists.", code="job_exists")
    job = Job(**data.model_dump())
    session.add(job)
    await session.commit()
    return JobRead.model_validate(job)


async def update_job(session: AsyncSession, job_id: uuid.UUID, data: JobUpdate) -> JobRead:
    job = await get_job(session, job_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)
