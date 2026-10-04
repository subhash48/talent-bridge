"""Every table, imported here so Base.metadata is complete wherever models are used."""

from app.models.activity import CandidateActivity
from app.models.ai_analysis import AIAnalysis
from app.models.application import Application, CandidateStageHistory
from app.models.base import Base
from app.models.candidate import Candidate
from app.models.engagement import CandidateEngagementEvent, PortalSession
from app.models.integration import AshbySyncState, AshbyWebhookEvent
from app.models.interview import Interview
from app.models.job import Job
from app.models.message import Message
from app.models.user import User

__all__ = [
    "AIAnalysis",
    "Application",
    "AshbySyncState",
    "AshbyWebhookEvent",
    "Base",
    "Candidate",
    "CandidateActivity",
    "CandidateEngagementEvent",
    "CandidateStageHistory",
    "Interview",
    "Job",
    "Message",
    "PortalSession",
    "User",
]
