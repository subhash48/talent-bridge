"""The webhook payloads the development-only Ashby simulator (demo.py) delivers, built from the values
given and nothing else: no files are read, so it works wherever app/ is installed.

The shapes follow Ashby's webhook reference (developers.ashbyhq.com, API version 2026-01-01) for the
fields the integration reads (schemas.py) plus the envelope around them. Fields Ashby sends that the
integration deliberately ignores (the hiring team, offer details, the submitter's IP, feedback links)
are left out. The simulator's jobs share one interview plan, STAGES; mapping.py decides what each
stage becomes in Talent Bridge, exactly as for a real delivery.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

INTERVIEW_PLAN_ID = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a77"
INTERVIEW_ID = "a3b4c5d6-e7f8-4a9b-8c0d-1e2f3a4b5c6d"
MEETING_LINK = "https://meet.example.com/ml-technical"
INTERVIEWERS = (("Tom", "Reid"),)

# The simulator's interview plan: Ashby stage title -> (stage id, stage type).
STAGES: dict[str, tuple[str, str]] = {
    "Application Review": ("a7f3c2e1-4b5d-4e6f-8a9b-0c1d2e3f4a51", "PreInterviewScreen"),
    "Technical Interview": ("b8a4d3f2-5c6e-4f7a-9b0c-1d2e3f4a5b62", "Active"),
    "Offer": ("c9b5e4a3-6d7f-4a8b-9c0d-1e2f3a4b5c73", "Offer"),
    "Hired": ("d0c6f5b4-7e8a-4b9c-8d1e-2f3a4b5c6d84", "Hired"),
    "Archived": ("e1d7a6c5-8f9b-4c0d-8e2f-3a4b5c6d7e95", "Archived"),
}
DEFAULT_SOURCE = "Applied"


def iso(moment: datetime) -> str:
    """A timestamp as Ashby writes one: UTC, milliseconds, Z."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def application_event(
    action: str,
    *,
    webhook_action_id: str,
    application_id: str,
    candidate_id: str,
    email: str,
    name: str,
    job_id: str,
    job_title: str,
    stage: str,
    updated_at: datetime,
    created_at: datetime,
    status: str = "Active",
    phone: str | None = None,
    source: str | None = None,
    archive_reason_type: str | None = None,
) -> dict[str, Any]:
    """An application webhook: applicationSubmit, applicationUpdate, candidateStageChange or candidateHire.

    A blank name, and no phone, leave the person's details in Talent Bridge as they are.
    """
    stage_id, stage_type = STAGES[stage]
    candidate: dict[str, Any] = {
        "id": candidate_id,
        "name": name,
        "primaryEmailAddress": {"value": email, "type": "Personal", "isPrimary": True},
    }
    if phone:
        candidate["primaryPhoneNumber"] = {"value": phone, "type": "Mobile", "isPrimary": True}
    archive_reason = None
    if archive_reason_type:
        archive_reason = {"reasonType": archive_reason_type, "isArchived": False, "customFields": []}
    return {
        "webhookActionId": webhook_action_id,
        "action": action,
        "data": {
            "application": {
                "id": application_id,
                "createdAt": iso(created_at),
                "updatedAt": iso(updated_at),
                "status": status,
                "customFields": [],
                "candidate": candidate,
                "currentInterviewStage": {
                    "id": stage_id,
                    "title": stage,
                    "type": stage_type,
                    "orderInInterviewPlan": list(STAGES).index(stage) + 1,
                    "interviewPlanId": INTERVIEW_PLAN_ID,
                },
                "source": {"title": source or DEFAULT_SOURCE, "isArchived": False},
                "archiveReason": archive_reason,
                "archivedAt": iso(updated_at) if archive_reason else None,
                "job": {"id": job_id, "title": job_title},
                "hiringTeam": [],
            }
        },
    }


def job_event(
    action: str,
    *,
    webhook_action_id: str,
    job_id: str,
    title: str,
    at: datetime,
    status: str = "Open",
    employment_type: str = "FullTime",
) -> dict[str, Any]:
    """A job webhook: jobCreate or jobUpdate, for a job opened at `at`."""
    return {
        "webhookActionId": webhook_action_id,
        "action": action,
        "data": {
            "job": {
                "id": job_id,
                "title": title,
                "confidential": False,
                "status": status,
                "employmentType": employment_type,
                "defaultInterviewPlanId": INTERVIEW_PLAN_ID,
                "interviewPlanIds": [INTERVIEW_PLAN_ID],
                "customFields": [],
                "hiringTeam": [],
                "createdAt": iso(at),
                "updatedAt": iso(at),
                "openedAt": iso(at),
                "closedAt": None if status == "Open" else iso(at),
            }
        },
    }


def schedule_event(
    action: str,
    *,
    webhook_action_id: str,
    application_id: str,
    schedule_id: str,
    event_id: str,
    start: datetime,
    updated_at: datetime,
    minutes: int = 60,
    status: str = "Scheduled",
    stage: str = "Technical Interview",
) -> dict[str, Any]:
    """An interview schedule webhook (interviewScheduleCreate or interviewScheduleUpdate) with one event."""
    version = iso(updated_at)
    return {
        "webhookActionId": webhook_action_id,
        "action": action,
        "data": {
            "interviewSchedule": {
                "id": schedule_id,
                "status": status,
                "applicationId": application_id,
                "interviewStageId": STAGES[stage][0],
                "createdAt": version,
                "updatedAt": version,
                "interviewEvents": [
                    {
                        "id": event_id,
                        "interviewId": INTERVIEW_ID,
                        "interviewScheduleId": schedule_id,
                        "interviewers": [
                            {"firstName": first, "lastName": last, "isFeedbackRequired": True}
                            for first, last in INTERVIEWERS
                        ],
                        "createdAt": version,
                        "updatedAt": version,
                        "startTime": iso(start),
                        "endTime": iso(start + timedelta(minutes=minutes)),
                        "location": None,
                        "meetingLink": MEETING_LINK,
                    }
                ],
            }
        },
    }
