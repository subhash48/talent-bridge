"""Kavuntra's own careers site (/careers): open jobs, and applying without an account.

The job shapes are the demo careers site's (schemas/demo.py), so the same pages show either.
"""

import re
from typing import Annotated, Literal

from pydantic import EmailStr, Field, field_validator

from app.core.enums import Weekday
from app.schemas.common import APIModel
from app.schemas.demo import CareerJobDetail, CareerJobSummary, ResumeUpload

__all__ = ["ApplicationCreate", "ApplicationResult", "CareerJobDetail", "CareerJobSummary"]

Name = Annotated[str, Field(min_length=1, max_length=100)]
_PHONE = re.compile(r"^\+?[0-9 ().\-/]+$")
_LINKEDIN = re.compile(r"^https?://([a-z]{2,3}\.)?linkedin\.com/(in|pub)/[^\s/?#]+/?$", re.IGNORECASE)


class ApplicationCreate(APIModel):
    """Name, email, phone and résumé, a LinkedIn profile if they like, and what the job asks: which of its
    work days they can work, and their relevant experience. No account and no password: the link to
    their candidate portal comes by email."""

    first_name: Name
    last_name: Name
    email: EmailStr
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

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        digits = sum(character.isdigit() for character in value)
        if not _PHONE.match(value) or not 7 <= digits <= 15:
            raise ValueError("enter a phone number, like +1 415 555 0100")
        return value.strip()


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
    # Kavuntra emailed its own confirmation with the link (an email provider is configured); otherwise
    # the link came in Supabase's invitation or sign-in email.
    confirmation_emailed: bool = False
