"""The public website's contact form (POST /contact). Mirrors frontend/types/contact.ts."""

from typing import Annotated

from pydantic import EmailStr, Field, field_validator

from app.core.enums import ContactTopic
from app.schemas.common import APIModel, OptionalText


class ContactInfo(APIModel):
    """What the Contact section shows: the official address when one is configured (CONTACT_EMAIL),
    never a made-up one."""

    email: str | None = None
    topics: list[ContactTopic]


class ContactCreate(APIModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    email: EmailStr
    company: OptionalText(200) = None
    topic: ContactTopic
    message: Annotated[str, Field(min_length=1, max_length=5000)]
    # Left empty by people; a form filler that fills every field fills this too, and is quietly ignored.
    website: Annotated[str, Field(max_length=200)] | None = None

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()


class ContactReceived(APIModel):
    received: bool = True
