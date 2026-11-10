"""The Hirvello job board (/jobs): open public jobs from every employer, searching them, and applying, with or
without an account.

The job shapes are the demo careers site's (schemas/demo.py), so the same pages show either.
"""

import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from app.core.enums import JobSource, Weekday, WorkArrangement
from app.schemas.common import APIModel
from app.schemas.demo import CareerJobDetail, CareerJobSummary, ResumeUpload

__all__ = [
    "ApplicationCreate",
    "ApplicationResult",
    "CandidateApplicationCreate",
    "CandidateApplyResult",
    "CareerJobDetail",
    "CareerJobSummary",
    "JobBoardCounts",
    "JobBoardPage",
    "JobBoardQuery",
]

Name = Annotated[str, Field(min_length=1, max_length=100)]
_PHONE = re.compile(r"^\+?[0-9 ().\-/]+$")
_LINKEDIN = re.compile(r"^https?://([a-z]{2,3}\.)?linkedin\.com/(in|pub)/[^\s/?#]+/?$", re.IGNORECASE)

# The job board's filters

EmploymentFilter = Literal["full_time", "part_time", "contract", "internship"]
# How recent, in days: the board's "Past 24 hours" to "Past month".
POSTED_WITHIN_DAYS = (1, 3, 7, 14, 30)


class JobBoardQuery(APIModel):
    """GET /careers/search. Every filter is optional; together they narrow the list.

    q              words in the title, department, description, company name or location
    location       part of the location ("London")
    arrangement    on-site, hybrid or remote; several mean any of them
    type           full_time, part_time, contract or internship; several mean any of them
    salary         "listed" (the job gives its pay), or the least yearly pay in USD (no currency conversion)
    posted_within  days: 1, 3, 7, 14 or 30
    source         who posted it: recruiter or small_business (the tabs)
    """

    q: Annotated[str, Field(max_length=100)] | None = None
    location: Annotated[str, Field(max_length=100)] | None = None
    arrangement: list[WorkArrangement] = []
    type: list[EmploymentFilter] = []
    salary: Annotated[str, Field(pattern=r"^(listed|\d{1,8})$")] | None = None
    posted_within: int | None = None
    source: JobSource | None = None
    limit: Annotated[int, Field(ge=1, le=50)] = 20
    offset: Annotated[int, Field(ge=0)] = 0

    # Before the pattern and int checks: "?salary=&posted_within=" (a cleared field, a hand-edited URL) means no filter.
    @field_validator("q", "location", "salary", "posted_within", "source", mode="before")
    @classmethod
    def _blank(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("posted_within")
    @classmethod
    def _known_window(cls, value: int | None) -> int | None:
        if value is not None and value not in POSTED_WITHIN_DAYS:
            raise ValueError(f"must be one of {', '.join(str(days) for days in POSTED_WITHIN_DAYS)}")
        return value


class JobBoardCounts(APIModel):
    """How many jobs each tab has with the other filters applied, so the counts match what each tab shows."""

    all: int
    recruiter: int
    small_business: int


class JobBoardPage(APIModel):
    items: list[CareerJobSummary]
    total: int  # matching every filter, the tab's included
    counts: JobBoardCounts
    limit: int
    offset: int


# Applying


class _ApplicationAnswers(APIModel):
    """What an application gives the employer besides who it's from: a phone number, the résumé, a LinkedIn
    profile if they like, and what the job asks (which of its work days they can work, their relevant
    experience)."""

    phone: Annotated[str, Field(max_length=40)] | None = None
    resume: ResumeUpload
    linkedin_url: Annotated[str, Field(max_length=300)] | None = None
    availability: Annotated[list[Weekday], Field(max_length=7)] = []
    experience_note: Annotated[str, Field(max_length=2000)] | None = None

    @field_validator("linkedin_url")
    @classmethod
    def _linkedin(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        url = value.strip()
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        if not _LINKEDIN.match(url):
            raise ValueError("enter your LinkedIn profile's address, like https://www.linkedin.com/in/your-name")
        return url

    @field_validator("availability")
    @classmethod
    def _once_each(cls, value: list[Weekday]) -> list[Weekday]:
        return [day for day in Weekday if day in value]  # Monday first, each day once

    @field_validator("experience_note")
    @classmethod
    def _blank(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        digits = sum(character.isdigit() for character in value)
        if not _PHONE.match(value) or not 7 <= digits <= 15:
            raise ValueError("enter a phone number, like +1 415 555 0100")
        return value.strip()


class ApplicationCreate(_ApplicationAnswers):
    """Applying without an account: a name and an email with the answers. No password: the link to their
    candidate portal comes by email."""

    first_name: Name
    last_name: Name
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()


class CandidateApplicationCreate(_ApplicationAnswers):
    """Applying signed in to the candidate portal. Their name and email are their account's, never the
    request's: anything else sent is ignored."""


class ApplicationResult(APIModel):
    """What happened, for the careers site to tell the applicant.

    status        submitted (new), or already_applied (to this job before: nothing was added)
    portal_link   how they get into their candidate portal: invitation_sent (a new account's
                  invitation), sign_in_link_sent (an existing account's sign-in link), or unavailable
                  (it couldn't be emailed: the application still went through)
    """

    status: Literal["submitted", "already_applied"]
    portal_link: Literal["invitation_sent", "sign_in_link_sent", "unavailable"]
    email: str
    job_title: str
    company: str | None = None
    # Hirvello emailed its own confirmation with the link (an email provider is configured); otherwise
    # the link came in Supabase's invitation or sign-in email.
    confirmation_emailed: bool = False


class CandidateApplyResult(APIModel):
    """POST /candidate/jobs/{id}/apply. Nothing is emailed: they're signed in, and the application is in
    their portal at once (GET /candidate/applications)."""

    status: Literal["submitted", "already_applied"]
    application_id: UUID
    job_title: str
    company: str | None = None
