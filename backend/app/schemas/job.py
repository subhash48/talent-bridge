"""Job schemas. Mirrors frontend/types/job.ts."""

from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BeforeValidator, Field, ValidationInfo, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.core.enums import JobSource, JobStatus, JobVisibility, SalaryPeriod, Weekday, WorkArrangement
from app.schemas.common import APIModel, OptionalText, Timestamp

Title = Annotated[str, Field(min_length=1, max_length=200)]
# Whole units of the currency, per the salary's period.
SalaryAmount = Annotated[int, Field(ge=0, le=10_000_000)]
MAX_BELOW_MIN = "The maximum salary can't be less than the minimum."
PAST_CLOSING_DATE = "Choose a closing date in the future."
DEFAULT_CURRENCY = "USD"


def _currency(value: Any) -> Any:
    """ "usd" is USD; blank is none."""
    if isinstance(value, str):
        return value.strip().upper() or None
    return value


Currency = Annotated[Annotated[str, Field(pattern=r"^[A-Z]{3}$")] | None, BeforeValidator(_currency)]


def salary_terms(
    salary_min: int | None, salary_max: int | None, currency: str | None, period: SalaryPeriod | None
) -> tuple[str | None, SalaryPeriod | None]:
    """The currency and period a salary is given in: USD a year unless the employer said otherwise. A job with
    no salary numbers has neither, so a currency left from an old salary never shows on its own."""
    if salary_min is None and salary_max is None:
        return None, None
    return currency or DEFAULT_CURRENCY, period or SalaryPeriod.YEAR


def salary_range_error() -> PydanticCustomError:
    return PydanticCustomError("salary_range", MAX_BELOW_MIN)


class JobCreate(APIModel):
    """A job an employer makes. Another system's id (external_id) is set only by the integration that imports
    its jobs: one sent here is ignored, so no workspace can take a job id that's another employer's. Who posted
    it (posted_by) isn't taken from here either: it's the employer's workspace's (services/job_service.py)."""

    title: Title
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    description: OptionalText(5000) = None
    status: JobStatus = JobStatus.OPEN
    employment_type: Annotated[str, Field(min_length=1, max_length=50)] = "Full-time"
    hiring_manager: OptionalText(200) = None
    # A small business's job, in the employer's words (migration 020).
    pay: OptionalText(100) = None
    shift: OptionalText(100) = None
    work_days: Annotated[list[Weekday], Field(max_length=7)] = []
    openings: Annotated[int, Field(ge=1, le=500)] | None = None
    # The job board (migration 022).
    work_arrangement: WorkArrangement | None = None
    salary_min: SalaryAmount | None = None
    salary_max: SalaryAmount | None = None
    salary_currency: Currency = None
    salary_period: SalaryPeriod | None = None
    expires_at: Timestamp | None = None  # when it stops taking applications
    visibility: JobVisibility = JobVisibility.PUBLIC

    @field_validator("salary_max")
    @classmethod
    def _not_below_min(cls, value: int | None, info: ValidationInfo) -> int | None:
        low = info.data.get("salary_min")
        if value is not None and low is not None and value < low:
            raise salary_range_error()
        return value

    @field_validator("expires_at")
    @classmethod
    def _in_the_future(cls, value: datetime | None) -> datetime | None:
        if value is not None and value <= datetime.now(UTC):
            raise PydanticCustomError("closing_date", PAST_CLOSING_DATE)
        return value

    @model_validator(mode="after")
    def _salary_terms(self) -> "JobCreate":
        self.salary_currency, self.salary_period = salary_terms(
            self.salary_min, self.salary_max, self.salary_currency, self.salary_period
        )
        return self


class JobUpdate(APIModel):
    """Only the fields sent are changed. The salary range is checked against what the job already has
    (services/job_service.py), so sending just one end of it works."""

    title: Title | None = None
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    description: OptionalText(5000) = None
    status: JobStatus | None = None
    employment_type: Annotated[str, Field(min_length=1, max_length=50)] | None = None
    hiring_manager: OptionalText(200) = None
    pay: OptionalText(100) = None
    shift: OptionalText(100) = None
    work_days: Annotated[list[Weekday], Field(max_length=7)] | None = None
    openings: Annotated[int, Field(ge=1, le=500)] | None = None
    work_arrangement: WorkArrangement | None = None
    salary_min: SalaryAmount | None = None
    salary_max: SalaryAmount | None = None
    salary_currency: Currency = None
    salary_period: SalaryPeriod | None = None
    # A date that has passed is allowed here: it's how an employer stops applications now.
    expires_at: Timestamp | None = None
    visibility: JobVisibility | None = None

    @field_validator("title", "status", "employment_type", "visibility", mode="before")
    @classmethod
    def _required_if_sent(cls, value: object) -> object:
        if value is None:
            raise ValueError("can't be empty")
        return value

    @field_validator("salary_max")
    @classmethod
    def _not_below_min(cls, value: int | None, info: ValidationInfo) -> int | None:
        low = info.data.get("salary_min")
        if value is not None and low is not None and value < low:
            raise salary_range_error()
        return value


class JobBrief(APIModel):
    id: UUID
    title: str
    department: str | None = None
    location: str | None = None
    status: JobStatus


class JobRead(JobBrief):
    external_id: str | None = None
    description: str | None = None
    employment_type: str
    hiring_manager: str | None = None
    pay: str | None = None
    shift: str | None = None
    work_days: list[Weekday] = []
    openings: int | None = None
    posted_by: JobSource  # set from the workspace when it was posted; never changes
    work_arrangement: WorkArrangement | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    salary_period: SalaryPeriod | None = None
    visibility: JobVisibility = JobVisibility.PUBLIC
    published_at: Timestamp | None = None  # the first time it opened
    expires_at: Timestamp | None = None
    created_at: Timestamp
    updated_at: Timestamp
