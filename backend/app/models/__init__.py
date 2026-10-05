"""Every table, imported here so Base.metadata is complete wherever models are used."""

from app.models.activity import CandidateActivity
from app.models.ai_analysis import AIAnalysis
from app.models.application import Application, CandidateStageHistory
from app.models.assistant import AssistantAction
from app.models.base import Base
from app.models.candidate import Candidate
from app.models.demo import DemoApplication, DemoJobPosting, DemoResume
from app.models.demographics import CandidateDemographics, DemoApplicationDemographics
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
    "AssistantAction",
    "Base",
    "Candidate",
    "CandidateActivity",
    "CandidateDemographics",
    "CandidateEngagementEvent",
    "CandidateStageHistory",
    "DemoApplication",
    "DemoApplicationDemographics",
    "DemoJobPosting",
    "DemoResume",
    "Interview",
    "Job",
    "Message",
    "PortalSession",
    "User",
]
