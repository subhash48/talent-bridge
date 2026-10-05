"""Development-only demo careers: recruiter-created demo jobs, the AI job writer and the public careers
site (/demo/careers). Mirrors frontend/types/demo.ts (recruiter) and frontend/types/careers.ts (public).
"""

import re
from typing import Annotated, Any, Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BeforeValidator, EmailStr, Field, field_validator, model_validator

from app.core.enums import DemoPostingStatus, JobStatus
from app.schemas.common import APIModel, OptionalText, OptionalURL, Timestamp
from app.schemas.demographics import DemographicAnswers

WorkArrangement = Literal["On-site", "Hybrid", "Remote"]
EmploymentType = Literal["Full-time", "Part-time", "Contract", "Internship", "Temporary"]
Seniority = Literal["Internship", "Entry Level", "Mid Level", "Senior", "Staff", "Principal", "Manager", "Director"]

MAX_SUMMARY = 600
MAX_ABOUT_ROLE = 3000
MAX_ABOUT_TEAM = 1500
MAX_NOTES = 1000
MAX_ITEM = 300
MAX_ITEMS = 12
MAX_SKILL = 40
MAX_SKILLS = 20
MAX_RESUME_BYTES = 5 * 1024 * 1024
# Base64 of MAX_RESUME_BYTES, plus room for line breaks some encoders add.
MAX_RESUME_BASE64 = 7_200_000


def clean_list(value: Any) -> Any:
    """Each string trimmed with its inner whitespace collapsed; blanks and repeats (ignoring case) dropped."""
    if not isinstance(value, list):
        return value
    seen: set[str] = set()
    cleaned: list[Any] = []
    for item in value:
        if isinstance(item, str):
            item = " ".join(item.split())
            if not item or item.lower() in seen:
                continue
            seen.add(item.lower())
        cleaned.append(item)
    return cleaned


Title = Annotated[str, Field(min_length=1, max_length=200)]
# A yearly pay amount in whole units of the currency, set by the recruiter (never by the AI job writer).
Salary = Annotated[int, Field(gt=0, le=10_000_000)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
Skill = Annotated[str, Field(min_length=1, max_length=MAX_SKILL)]
Skills = Annotated[list[Skill], BeforeValidator(clean_list), Field(max_length=MAX_SKILLS)]
Item = Annotated[str, Field(min_length=1, max_length=MAX_ITEM)]
Items = Annotated[list[Item], BeforeValidator(clean_list), Field(max_length=MAX_ITEMS)]


# The AI job writer


class JobPostingBrief(APIModel):
    """What the recruiter gives the AI job writer: the job's basics and a few notes."""

    title: Title
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    work_arrangement: WorkArrangement | None = None
    employment_type: EmploymentType = "Full-time"
    seniority: Seniority | None = None
    skills: Skills = []
    notes: OptionalText(MAX_NOTES) = None


class JobPostingContent(APIModel):
    """A posting's text, as the AI job writer drafts it and the recruiter edits it."""

    summary: Annotated[str, Field(max_length=MAX_SUMMARY)] = ""
    about_role: Annotated[str, Field(max_length=MAX_ABOUT_ROLE)] = ""
    responsibilities: Items = []
    requirements: Items = []
    preferred_qualifications: Items = []
    skills: Skills = []
    about_team: OptionalText(MAX_ABOUT_TEAM) = None


class GeneratedJobPosting(APIModel):
    """POST /demo/jobs/generate: a draft for the recruiter to review and edit. Nothing is saved, and
    nothing is published until the recruiter publishes it."""

    draft: JobPostingContent
    model_name: str  # the model that wrote it, or "mock (fallback from groq)"
    removed: int = 0  # items the posting policy dropped (they mentioned a protected characteristic)


# Demo jobs, for recruiters


class _PostingFields(APIModel):
    department: OptionalText(100) = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    location: OptionalText(200) = None
    work_arrangement: WorkArrangement | None = None
    seniority: Seniority | None = None
    notes: OptionalText(MAX_NOTES) = None
    summary: OptionalText(MAX_SUMMARY) = None
    about_role: OptionalText(MAX_ABOUT_ROLE) = None
    about_team: OptionalText(MAX_ABOUT_TEAM) = None
    generated_by_model: OptionalText(100) = None

    @model_validator(mode="after")
    def _salary_range(self) -> "_PostingFields":
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("the minimum salary can't be more than the maximum")
        return self


class DemoJobCreate(_PostingFields):
    """A new demo job. It starts as a draft; publishing it is a separate step."""

    title: Title
    employment_type: EmploymentType = "Full-time"
    salary_currency: Currency = "USD"
    skills: Skills = []
    responsibilities: Items = []
    requirements: Items = []
    preferred_qualifications: Items = []


class DemoJobUpdate(_PostingFields):
    """Only the fields sent are changed. null clears an optional field; lists are cleared with []."""

    title: Title | None = None
    employment_type: EmploymentType | None = None
    salary_currency: Currency | None = None
    skills: Skills | None = None
    responsibilities: Items | None = None
    requirements: Items | None = None
    preferred_qualifications: Items | None = None

    @field_validator(
        "title",
        "employment_type",
        "salary_currency",
        "skills",
        "responsibilities",
        "requirements",
        "preferred_qualifications",
        mode="before",
    )
    @classmethod
    def _required_if_sent(cls, value: object) -> object:
        if value is None:
            raise ValueError("can't be empty")
        return value


class DemoJobRead(APIModel):
    """A demo job as the recruiter manages it."""

    id: UUID  # the job's id: /recruiter/jobs/{id} shows its pipeline
    title: str
    department: str | None = None
    location: str | None = None
    work_arrangement: str | None = None
    employment_type: str
    seniority: str | None = None
    skills: list[str] = []
    notes: str | None = None
    summary: str | None = None
    about_role: str | None = None
    responsibilities: list[str] = []
    requirements: list[str] = []
    preferred_qualifications: list[str] = []
    about_team: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = "USD"
    generated_by_model: str | None = None
    status: DemoPostingStatus  # the posting, on the careers site
    job_status: JobStatus  # the job itself, in the ATS
    published_at: Timestamp | None = None
    closed_at: Timestamp | None = None
    applicant_count: int = 0  # applications submitted (the applicant activated), at any stage
    pending_count: int = 0  # careers applications waiting for the applicant to activate or sign in
    public_path: str  # the posting on the careers site: /demo/careers/{id}
    created_at: Timestamp
    updated_at: Timestamp


# The public careers site


class CareerJobSummary(APIModel):
    """A published demo job, as the careers site lists it."""

    id: UUID
    title: str
    department: str | None = None
    location: str | None = None
    work_arrangement: str | None = None
    employment_type: str
    seniority: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = "USD"
    summary: str | None = None
    published_at: Timestamp | None = None


class CareerJobDetail(CareerJobSummary):
    about_role: str | None = None
    responsibilities: list[str] = []
    requirements: list[str] = []
    preferred_qualifications: list[str] = []
    skills: list[str] = []
    about_team: str | None = None


class ResumeUpload(APIModel):
    """The résumé, base64-encoded: PDF, DOC or DOCX, up to 5 MB. Its type is decided by its content,
    never by the file name or the type the browser reports."""

    file_name: Annotated[str, Field(min_length=1, max_length=255)]
    content_type: Annotated[str, Field(max_length=200)] = ""
    data: Annotated[str, Field(min_length=1, max_length=MAX_RESUME_BASE64)]


Name = Annotated[str, Field(min_length=1, max_length=100)]
_PHONE = re.compile(r"^\+?[0-9 ().\-/]+$")


class CareerApplicationCreate(APIModel):
    first_name: Name
    last_name: Name
    email: EmailStr
    phone: Annotated[str, Field(min_length=7, max_length=40)]
    linkedin_url: OptionalURL = None
    resume: ResumeUpload
    # Optional, every question: used only in aggregate and kept apart from the application.
    demographics: DemographicAnswers | None = None

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        digits = sum(character.isdigit() for character in value)
        if not _PHONE.match(value) or not 7 <= digits <= 15:
            raise ValueError("enter a phone number, like +1 415 555 0100")
        return value

    @field_validator("linkedin_url")
    @classmethod
    def _linkedin(cls, value: str | None) -> str | None:
        host = (urlparse(value).hostname or "").lower() if value else ""
        if value and host != "linkedin.com" and not host.endswith(".linkedin.com"):
            raise ValueError("must be a linkedin.com link")
        return value


ApplyOutcome = Literal["invitation_sent", "sign_in_required", "already_applied", "invitation_failed"]


class CareerApplicationResult(APIModel):
    """What happened to an application, for the careers site to tell the applicant:

    invitation_sent    check your inbox and activate your account (also when an invitation sent for
                       an earlier application covers this one)
    sign_in_required   the email already has a portal account: signing in submits the application
    already_applied    submitted before; it is in their candidate portal
    invitation_failed  saved, but the activation email couldn't be sent: applying again retries it
    """

    status: ApplyOutcome
    email: str
    job_title: str
