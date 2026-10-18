"""AI request and response schemas.

The AI answers and drafts for a recruiter to review. Nothing here can evaluate a candidate, change a
stage, send a message or make a hiring decision.
"""

from enum import StrEnum
from uuid import UUID

from app.schemas.common import APIModel, OptionalText


class AISource(APIModel):
    """A part of the record an answer was based on, shown as a source chip."""

    type: str
    id: str
    label: str


class AskCandidateResponse(APIModel):
    """The assistant's answer to a status question about one application."""

    answer: str
    sources: list[AISource] = []
    model_name: str


class DraftPurpose(StrEnum):
    FOLLOW_UP = "follow_up"
    OUTREACH = "outreach"
    INTERVIEW_CONFIRMATION = "interview_confirmation"
    STATUS_UPDATE = "status_update"
    OFFER_CHECK_IN = "offer_check_in"
    INTERVIEW_INVITATION = "interview_invitation"  # ask them to choose a time for an interview
    CUSTOM = "custom"  # whatever the recruiter's instructions say
    QUESTION_REPLY = "question_reply"  # a reply to the candidate's latest message
    STAGE_UPDATE = "stage_update"  # their application moved to a new stage


class DraftMessageRequest(APIModel):
    application_id: UUID
    purpose: DraftPurpose = DraftPurpose.FOLLOW_UP
    instructions: OptionalText(500) = None


class DraftContent(APIModel):
    subject: str
    body: str


class DraftMessageResponse(DraftContent):
    """A draft for the recruiter to edit and send. It is never sent automatically."""

    purpose: DraftPurpose
    model_name: str


class AskContent(APIModel):
    answer: str
    sources: list[AISource] = []
