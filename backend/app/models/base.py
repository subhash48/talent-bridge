"""Declarative base and the column types every table shares.

The types are portable: the same models run on Supabase Postgres (uuid, jsonb, enum types,
timestamptz) and on SQLite for local development and the tests.
"""

import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, ClassVar

from sqlalchemy import JSON, DateTime, Dialect, Enum, TypeDecorator, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

_last_now = datetime.min.replace(tzinfo=UTC)


def utcnow() -> datetime:
    """The current UTC time, strictly increasing within the process.

    Some clocks (Windows, before Python 3.13) only tick every ~15 ms, so two quick actions could
    get the same timestamp and the timeline would order them at random. Each call is at least a
    microsecond after the previous one instead.
    """
    global _last_now
    now = datetime.now(UTC)
    if now <= _last_now:
        now = _last_now + timedelta(microseconds=1)
    _last_now = now
    return now


class UTCDateTime(TypeDecorator[datetime]):
    """timestamptz on Postgres. SQLite has no time zones, so values are stored as UTC and
    always read back timezone-aware, which keeps API timestamps unambiguous."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


JSONType = JSON().with_variant(JSONB(), "postgresql")


def db_enum(enum_class: type[StrEnum], name: str) -> Enum:
    """A Postgres enum type (created by the migrations); plain text on SQLite."""
    return Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
        create_constraint=False,
    )


def text_enum(enum_class: type[StrEnum]) -> Enum:
    """An enum stored as text, for columns whose allowed values a check constraint lists (or none)."""
    return Enum(
        enum_class,
        native_enum=False,
        length=32,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
        create_constraint=False,
    )


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {datetime: UTCDateTime, uuid.UUID: Uuid, dict[str, Any]: JSONType}


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, server_default=func.now())
