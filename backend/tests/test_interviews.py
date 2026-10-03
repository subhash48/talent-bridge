from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from tests.conftest import API, application_id

JAMES = application_id("james-park")


def in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


async def test_schedule_lists_interviews_with_the_candidate(client: AsyncClient) -> None:
    response = await client.get(f"{API}/interviews")
    assert response.status_code == 200
    interviews = response.json()
    assert len(interviews) == 14
    assert interviews == sorted(interviews, key=lambda i: i["scheduled_at"])
    design = next(i for i in interviews if i["title"] == "Design interview")
    assert design["candidate"]["full_name"] == "Sophia Martinez"
    assert design["candidate"]["job_title"] == "Product Designer"

    upcoming = (await client.get(f"{API}/interviews", params={"upcoming": "true"})).json()
    assert len(upcoming) == 10


async def test_schedule_an_interview(client: AsyncClient) -> None:
    response = await client.post(
        f"{API}/applications/{JAMES}/interviews",
        json={
            "title": "Hiring manager interview",
            "interview_type": "video",
            "scheduled_at": in_days(4),
            "duration_minutes": 45,
            "interviewers": ["Tom Reid"],
            "meeting_url": "https://meet.example.com/james",
        },
    )
    assert response.status_code == 201
    interview = response.json()
    assert interview["status"] == "scheduled"
    assert interview["interviewers"] == ["Tom Reid"]

    listed = (await client.get(f"{API}/applications/{JAMES}/interviews")).json()
    assert interview["id"] in {i["id"] for i in listed}

    activity = (await client.get(f"{API}/applications/{JAMES}/activity")).json()
    assert activity[0]["activity_type"] == "interview_scheduled"
    assert activity[0]["title"] == "Hiring manager interview scheduled"


async def test_schedule_validation(client: AsyncClient) -> None:
    past = await client.post(
        f"{API}/applications/{JAMES}/interviews", json={"title": "Too late", "scheduled_at": in_days(-1)}
    )
    assert past.status_code == 400
    assert past.json()["error"]["code"] == "interview_in_past"

    bad_type = await client.post(
        f"{API}/applications/{JAMES}/interviews",
        json={"title": "Call", "scheduled_at": in_days(2), "interview_type": "carrier pigeon"},
    )
    assert bad_type.status_code == 422

    hired = await client.post(
        f"{API}/applications/{application_id('mateo-garcia')}/interviews",
        json={"title": "Extra round", "scheduled_at": in_days(2)},
    )
    assert hired.status_code == 400

    missing = await client.post(
        f"{API}/applications/00000000-0000-0000-0000-000000000000/interviews",
        json={"title": "Call", "scheduled_at": in_days(2)},
    )
    assert missing.status_code == 404


async def test_complete_an_interview_with_feedback(client: AsyncClient) -> None:
    created = (
        await client.post(
            f"{API}/applications/{JAMES}/interviews", json={"title": "Pairing", "scheduled_at": in_days(1)}
        )
    ).json()
    response = await client.patch(
        f"{API}/interviews/{created['id']}", json={"status": "completed", "notes": "Strong debugging skills."}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    activity = (await client.get(f"{API}/applications/{JAMES}/activity")).json()
    assert activity[0]["activity_type"] == "interview_completed"
