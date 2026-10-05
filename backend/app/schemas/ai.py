"""AI request and response schemas.

The AI analyses and drafts for a recruiter to review. Nothing here can change a stage, send a
message or make a hiring decision.
"""

from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel, OptionalText, Timestamp


class SkillEvidence(APIModel):
    skill: str
    evidence: str


class AnalysisContent(APIModel):
    """What a provider returns for an analysis, and what is stored in ai_analysis."""

    summary: str
    skills_matched: list[SkillEvidence] = []
    missing_skills: list[str] = []
    strengths: list[str] = []
    concerns: list[str] = []
    suggested_questions: list[str] = []
    recommended_next_step: str


class AIAnalysisRead(AnalysisContent):
    id: UUID
    application_id: UUID
    model_name: str | None = None
    created_at: Timestamp


class AnalyzeCandidateRequest(APIModel):
    application_id: UUID


class AISource(APIModel):
    """A part of the record an answer was based on, shown as a source chip."""

    type: str
    id: str
    label: str


class AskCandidateRequest(APIModel):
    application_id: UUID
    message: Annotated[str, Field(min_length=1, max_length=2000)]


class AskCandidateResponse(APIModel):
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
