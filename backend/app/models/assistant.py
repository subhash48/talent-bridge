import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AssistantActionStatus
from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey, text_enum


class AssistantAction(UUIDPrimaryKey, Timestamps, Base):
    """One request to the recruiter assistant, typed or spoken, and what came of it (migration 014).

    It is the assistant's record of who asked for what: the words (a transcript for voice; the
    recording is never kept), the structured action they were understood as, the target and the
    result. A proposal (an external action such as sending a message or publishing a job) waits here
    for the recruiter's confirmation, and its status moves on exactly once, which is what makes one
    confirmation one send. client_request_id makes a repeated request (a double click) one request.
    """

    __tablename__ = "assistant_actions"
    __table_args__ = (
        UniqueConstraint("recruiter_id", "client_request_id", name="assistant_actions_request_key"),
        Index("assistant_actions_recruiter_idx", "recruiter_id", "created_at"),
    )

    recruiter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_request_id: Mapped[str | None] = mapped_column(Text)
    input_type: Mapped[str] = mapped_column(Text)  # an AssistantInputType value
    input_text: Mapped[str] = mapped_column(Text)
    intent: Mapped[str | None] = mapped_column(Text)  # the structured action, e.g. send_interview_email
    status: Mapped[AssistantActionStatus] = mapped_column(
        text_enum(AssistantActionStatus), default=AssistantActionStatus.PROCESSING
    )
    target_type: Mapped[str | None] = mapped_column(Text)  # application or job
    target_id: Mapped[uuid.UUID | None]
    target_label: Mapped[str | None] = mapped_column(Text)
    # The structured action and what the assistant prepared (a message, a job draft's id). Never
    # demographic information: nothing that holds it is reachable from here.
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    result_summary: Mapped[str | None] = mapped_column(Text)  # "Sent interview invitation to Sophia Martinez"
    error: Mapped[str | None] = mapped_column(Text)  # a safe summary of a failure
    executed_at: Mapped[datetime | None]
