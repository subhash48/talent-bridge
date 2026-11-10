"""Jobs: the roles candidates apply to."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus, Weekday
from app.core.errors import AppError, NotFoundError
from app.models import Job
from app.models.base import utcnow
from app.schemas.job import MAX_BELOW_MIN, JobCreate, JobRead, JobUpdate, salary_terms
from app.services.company_profile import job_source, workspace_company_id


class JobFieldError(AppError):
    """A change that's valid on its own but not with what the job already has. Shaped like a request
    validation error, so the job form shows it on the field."""

    status_code = 422
    code = "validation_error"


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
    """Who posted it comes from the workspace it's made in (Simple Hire: a small business), never from the
    request, and stays as it is if the workspace later changes how it hires."""
    values = data.model_dump()
    values["work_days"] = _days(data.work_days)
    company_id = await workspace_company_id(session)
    job = Job(
        **values,
        company_id=company_id,
        posted_by=await job_source(session, company_id),
        published_at=utcnow() if data.status == JobStatus.OPEN else None,
    )
    session.add(job)
    await session.commit()
    return JobRead.model_validate(job)


async def update_job(session: AsyncSession, job_id: uuid.UUID, data: JobUpdate) -> JobRead:
    job = await get_job(session, job_id)
    changes = data.model_dump(exclude_unset=True)
    low = changes.get("salary_min", job.salary_min)
    high = changes.get("salary_max", job.salary_max)
    if low is not None and high is not None and high < low:
        field = "salary_max" if "salary_max" in changes else "salary_min"
        raise JobFieldError(f"{field}: {MAX_BELOW_MIN}", details=[{"field": field, "message": MAX_BELOW_MIN}])
    for field, value in changes.items():
        setattr(job, field, _days(value) if field == "work_days" else value)
    job.salary_currency, job.salary_period = salary_terms(
        job.salary_min, job.salary_max, job.salary_currency, job.salary_period
    )
    # The first time it opens is when it went on the job board; closing and reopening keeps that date. Only a change
    # that opens it counts: editing the title of a job that's long been open mustn't make it "new" on the board.
    if changes.get("status") == JobStatus.OPEN and job.published_at is None:
        job.published_at = utcnow()
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)


def _days(days: list[Weekday] | None) -> list[str]:
    """Monday first, each day once."""
    return [day.value for day in Weekday if day in (days or [])]
