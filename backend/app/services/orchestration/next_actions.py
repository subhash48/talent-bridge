"""Next-action engine: ordered rules, first match wins.

A pure function of an application snapshot and `now`. Rules decide when a recruiter owes the
candidate something; the AI only phrases and drafts.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.enums import ActivityType, ApplicationStage, InterviewStatus, SenderType
from app.services.engagement import rules
from app.services.engagement.snapshot import ApplicationSnapshot

ACTIVE_STAGES = {
    ApplicationStage.SOURCED,
    ApplicationStage.SCREENING,
    ApplicationStage.INTERVIEW,
    ApplicationStage.OFFER,
}


@dataclass(frozen=True)
class NextAction:
    type: str  # e.g. "collect_feedback", "send_outreach", "none"
    label: str
    reason: str | None = None
    follow_up: bool = False  # counts toward the "Need follow-up" metric


NONE = NextAction("none", "No action needed")


def evaluate(snapshot: ApplicationSnapshot, now: datetime) -> NextAction:
    application = snapshot.application
    if application.archived_at is not None or application.stage not in ACTIVE_STAGES:
        return NONE

    for interview in snapshot.interviews:
        if (
            interview.status == InterviewStatus.COMPLETED
            and not interview.notes
            and now - interview.scheduled_at > rules.FEEDBACK_DUE_AFTER
        ):
            return NextAction("collect_feedback", "Collect interview feedback", "Interview feedback is overdue", True)

    recruiter_messages = [m for m in snapshot.messages if m.sender_type == SenderType.RECRUITER]
    outreach_logged = any(a.activity_type == ActivityType.MESSAGE_SENT for a in snapshot.activities)
    if application.stage == ApplicationStage.SOURCED and not recruiter_messages and not outreach_logged:
        return NextAction("send_outreach", "Send outreach", "No outreach sent yet", True)

    last_message = snapshot.messages[-1] if snapshot.messages else None
    if (
        last_message is not None
        and last_message.sender_type == SenderType.CANDIDATE
        and now - last_message.created_at >= rules.CANDIDATE_WAITING_AFTER
    ):
        waited = _days(now - last_message.created_at)
        return NextAction("reply", "Reply to the candidate", f"Waiting {waited} for your reply", True)

    sent = _latest(snapshot, ActivityType.ASSESSMENT_SENT)
    completed = _latest(snapshot, ActivityType.ASSESSMENT_COMPLETED)
    if sent is not None and (completed is None or completed < sent) and now - sent >= rules.ASSESSMENT_DUE_AFTER:
        return NextAction(
            "chase_assessment", "Check in on the assessment", f"Assessment not started after {_days(now - sent)}", True
        )

    if (
        last_message is not None
        and last_message.sender_type == SenderType.RECRUITER
        and now - last_message.created_at >= rules.NO_REPLY_AFTER
        and not any(a.created_at > last_message.created_at for a in snapshot.candidate_actions())
    ):
        silence = _days(now - last_message.created_at)
        reason = (
            f"No reply to outreach in {silence}"
            if application.stage == ApplicationStage.SOURCED
            else f"No reply in {silence}"
        )
        return NextAction("follow_up", "Follow up", reason, True)

    return NONE


def _latest(snapshot: ApplicationSnapshot, activity_type: ActivityType) -> datetime | None:
    return next((a.created_at for a in snapshot.activities if a.activity_type == activity_type), None)


def _days(delta: timedelta) -> str:
    days = max(1, delta.days)
    return f"{days} day" if days == 1 else f"{days} days"
