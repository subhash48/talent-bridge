"""AI request and response schemas (ARCHITECTURE.md 6.1, 6.9, 8.4).

The surface (Copilot or Assistant) is derived from the role on the server, never from the request.
Portal (candidate-facing) models are separate classes in this file and never include internal fields.
"""

from uuid import UUID

from pydantic import BaseModel, Field


class ChatFocus(BaseModel):
    application_id: UUID


class ChatRequest(BaseModel):
    """Body of POST /v1/ai/chat."""

    message: str = Field(min_length=1)
    conversation_id: UUID | None = None
    focus: ChatFocus | None = None


class FollowUpDraft(BaseModel):
    """Structured output of POST /v1/ai/draft-followup. A draft only; never sent by the AI."""

    subject: str
    body: str
