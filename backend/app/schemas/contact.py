"""The public website's contact form (POST /contact). Mirrors frontend/types/contact.ts."""

from typing import Annotated

from pydantic import EmailStr, Field, field_validator

from app.core.enums import ContactTopic
from app.schemas.common import APIModel, OptionalText

# With its "Subject:" line, a message stays inside the 5000 characters contact_requests.message allows.
MAX_SUBJECT = 150
MAX_MESSAGE = 4800


def _one_line(value: str) -> str:
    """Line breaks and control characters out: these end up in an email's subject and its From line."""
    return " ".join("".join(char if char.isprintable() else " " for char in value).split())


class ContactCreate(APIModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    email: EmailStr
    company: OptionalText(200) = None
    topic: ContactTopic
    subject: Annotated[str, Field(min_length=1, max_length=MAX_SUBJECT)]
    message: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE)]
    # Left empty by people; a form filler that fills every field fills this too, and is quietly ignored.
    website: Annotated[str, Field(max_length=200)] | None = None

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("name", "subject")
    @classmethod
    def _readable_line(cls, value: str) -> str:
        cleaned = _one_line(value)
        if not cleaned:
            raise ValueError("Enter some text.")
        return cleaned

    @field_validator("company")
    @classmethod
    def _readable_company(cls, value: str | None) -> str | None:
        return _one_line(value) or None if value else None

    @field_validator("message")
    @classmethod
    def _storable_message(cls, value: str) -> str:
        cleaned = value.replace("\x00", "").strip()  # Postgres can't store a NUL
        if not cleaned:
            raise ValueError("Enter a message.")
        return cleaned


class ContactReceived(APIModel):
    received: bool = True
