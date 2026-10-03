"""The facts the engagement and next-action engines read: one application and its history."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.core.enums import CANDIDATE_ACTIONS, InterviewStatus
from app.models import Application, CandidateActivity, Interview, Message


@dataclass(frozen=True)
class ApplicationSnapshot:
    application: Application
    activities: Sequence[CandidateActivity]  # newest first
    messages: Sequence[Message]  # oldest first
    interviews: Sequence[Interview]  # by scheduled time

    def candidate_actions(self) -> list[CandidateActivity]:
        """Activity the candidate initiated, newest first."""
        return [activity for activity in self.activities if activity.activity_type in CANDIDATE_ACTIONS]

    def upcoming_interview(self, now: datetime) -> Interview | None:
        return next(
            (
                interview
                for interview in self.interviews
                if interview.status == InterviewStatus.SCHEDULED and interview.scheduled_at > now
            ),
            None,
        )
