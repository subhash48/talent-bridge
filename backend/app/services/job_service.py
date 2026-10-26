"""Jobs: the roles candidates apply to."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus, Weekday
from app.core.errors import ConflictError, NotFoundError
from app.models import Job
from app.schemas.job import JobCreate, JobRead, JobUpdate
from app.services.company_profile import workspace_company_id


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
    values = data.model_dump()
    values["work_days"] = _days(data.work_days)
    job = Job(**values, company_id=await workspace_company_id(session))
    session.add(job)
    await session.commit()
    return JobRead.model_validate(job)


async def update_job(session: AsyncSession, job_id: uuid.UUID, data: JobUpdate) -> JobRead:
    job = await get_job(session, job_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, _days(value) if field == "work_days" else value)
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)


def _days(days: list[Weekday] | None) -> list[str]:
    """Monday first, each day once."""
    return [day.value for day in Weekday if day in (days or [])]
