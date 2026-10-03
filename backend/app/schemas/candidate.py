"""Candidate schemas and the platform Role (ARCHITECTURE.md 7.2, 10.1).

Role is defined here once and mirrors frontend/types/candidate.ts. Portal (candidate-facing) models
are separate classes in this file and never include internal fields (10.2 L4).
"""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class Role(StrEnum):
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
    ADMIN = "admin"


class Candidate(BaseModel):
    """Org-scoped person record as staff see it."""

    id: UUID
    name: str
    email: str
    phone: str | None = None
    location: str | None = None
    pronouns: str | None = None
    avatar_url: str | None = None
    headline: str | None = None
    created_at: datetime
