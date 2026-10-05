"""The recruiter assistant: one action engine for typed and spoken requests, confirmations that run once,
jobs through the same demo jobs as the Jobs page, analytics from the analytics services, and the
boundaries it never crosses (candidates' access, demographics, ranking)."""

from httpx import AsyncClient

from app.schemas.assistant import AssistantIntent, InterviewDetails

INVITE = "Send Sophia a personalized email asking her to schedule a 30-minute recruiter interview next Tuesday."
CREATE_JOB = (
    "Create an entry-level Recruiting Engineer job in San Francisco. Hybrid. Salary 90 to 120K. "
    "We need AI automation, recruiting, sourcing and Python."
)


# One engine for text and voice


async def test_a_request_is_understood_as_one_structured_action(client: AsyncClient) -> None:
    from app.services.assistant.rules import parse

    intent = parse(INVITE)
    assert intent == AssistantIntent(
        action="send_interview_email",
        mode="execute",
        candidate_name="Sophia",
        instructions=INVITE,
        interview=InterviewDetails(interview_type="Recruiter interview", duration_minutes=30, timeframe="next Tuesday"),
    )
    assert parse("Draft a message telling Daniel his interview moved to Thursday.").action == "draft_message"
    assert parse("How many candidates used the portal this week?").model_dump(exclude_defaults=True) == {
        "action": "analytics",
        "metric": "active_candidates",
        "period": "this_week",
    }
    job = parse(CREATE_JOB).job
    assert job is not None
    assert (job.title, job.location, job.work_arrangement, job.seniority) == (
        "Recruiting Engineer",
        "San Francisco",
        "Hybrid",
        "Entry Level",
    )
    assert (job.salary_min, job.salary_max) == (90_000, 120_000)
    assert job.skills_add == ["AI automation", "Recruiting", "Sourcing", "Python"]
    edit = parse("Make the salary 100 to 130 and add talent research.", job_in_context=True)
    assert edit.action == "update_job" and edit.job is not None
    assert (edit.job.salary_min, edit.job.salary_max, edit.job.skills_add) == (100_000, 130_000, ["Talent research"])
