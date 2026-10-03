"""Message schemas: one thread per application (ARCHITECTURE.md 7.2, 8.2, 8.3).

Portal (candidate-facing) models are separate classes in this file and never include internal fields.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.candidate import Role


class Message(BaseModel):
    id: UUID
    application_id: UUID
    sender_user_id: UUID
    sender_role: Role
    body: str
    channel: str = "portal"
    read_at: datetime | None = None
    created_at: datetime


class MessageCreate(BaseModel):
    """Body of POST .../messages on either façade."""

    body: str = Field(min_length=1)
