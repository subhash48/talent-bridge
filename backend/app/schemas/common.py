"""Shared schema building blocks: base model, timestamps, validated text, pagination."""

from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


def _as_utc(value: datetime) -> datetime:
    """Naive input is read as UTC; everything leaves the API in UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _iso(value: datetime) -> str:
    # Same format as JavaScript's Date.toISOString(), so the frontend can sort the strings.
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


Timestamp = Annotated[datetime, AfterValidator(_as_utc), PlainSerializer(_iso, return_type=str, when_used="json")]


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _http_url(value: str | None) -> str | None:
    if value is not None and not value.startswith(("https://", "http://")):
        raise ValueError("must be an http(s) URL")
    return value


def OptionalText(max_length: int) -> Any:
    """Optional free text: trimmed, blank becomes null, length-limited."""
    return Annotated[Annotated[str, Field(max_length=max_length)] | None, BeforeValidator(_blank_to_none)]


OptionalURL = Annotated[
    Annotated[str, Field(max_length=2000)] | None,
    BeforeValidator(_blank_to_none),
    AfterValidator(_http_url),
]


class Page[T](APIModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class CandidateRef(APIModel):
    """Enough to show who an interview or thread is about, and to link to them."""

    application_id: UUID
    candidate_id: UUID
    full_name: str
    avatar_url: str | None = None
    job_title: str
