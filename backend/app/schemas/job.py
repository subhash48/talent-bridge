"""Job schemas (ARCHITECTURE.md 7.2, 8.2).

Mirrors frontend/types/job.ts. Portal (candidate-facing) models are separate classes in this file
and expose only public fields of jobs the candidate applied to (10.3).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

JobStatus = Literal["draft", "open", "paused", "closed"]


class Job(BaseModel):
    """Staff view of a job."""

    id: UUID
    title: str
    team_id: UUID | None = None
    department: str | None = None
    location: str | None = None
    employment_type: str = "full_time"
    salary_range_public: str | None = None
    status: JobStatus = "open"
    created_at: datetime


class JobCreate(BaseModel):
    """Body of POST /v1/jobs."""

    title: str
    team_id: UUID | None = None
    department: str | None = None
    location: str | None = None
    employment_type: str = "full_time"
    description_md: str | None = None
    salary_range_public: str | None = None
