"""The facts communication health reads: one application and its history."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.core.enums import InterviewStatus
from app.models import Application, CandidateActivity, Interview, Message


@dataclass(frozen=True)
class ApplicationSnapshot:
    application: Application
    activities: Sequence[CandidateActivity]  # newest first
    messages: Sequence[Message]  # oldest first
    interviews: Sequence[Interview]  # by scheduled time

    def upcoming_interview(self, now: datetime) -> Interview | None:
        return next(
            (
                interview
                for interview in self.interviews
                if interview.status == InterviewStatus.SCHEDULED and interview.scheduled_at > now
            ),
            None,
        )
