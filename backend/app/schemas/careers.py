"""TalentBridge's own careers site (/careers): open jobs, and applying without an account.

The job shapes are the demo careers site's (schemas/demo.py), so the same pages show either.
"""

import re
from typing import Annotated, Literal

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import APIModel
from app.schemas.demo import CareerJobDetail, CareerJobSummary, ResumeUpload

__all__ = ["ApplicationCreate", "ApplicationResult", "CareerJobDetail", "CareerJobSummary"]

Name = Annotated[str, Field(min_length=1, max_length=100)]
_PHONE = re.compile(r"^\+?[0-9 ().\-/]+$")


class ApplicationCreate(APIModel):
    """Name, email and résumé. No account and no password: the portal link comes by email."""

    first_name: Name
    last_name: Name
    email: EmailStr
    phone: Annotated[str, Field(max_length=40)] | None = None
    resume: ResumeUpload

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
