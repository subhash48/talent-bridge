from httpx import AsyncClient

from tests.conftest import API, application_id, candidate_id, job_id

SOPHIA = "sophia-martinez"


# GET /candidates


async def test_list_returns_the_pipeline_most_recent_first(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates", params={"limit": 7})
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 32
    names = [item["candidate"]["full_name"] for item in page["items"]]
    assert names == [
        "Sophia Martinez",
        "James Park",
        "Priya Desai",
        "Daniel Lee",
        "Olivia Chen",
        "Ethan Walker",
        "Isabella Rossi",
    ]
    sophia = page["items"][0]
    assert sophia["application_id"] == application_id(SOPHIA)
    assert sophia["stage"] == "interview"
    assert sophia["job"]["title"] == "Product Designer"
    assert sophia["candidate"]["location"] == "London, UK"
    assert sophia["engagement"]["level"] == "high"
    assert sophia["last_activity"]["title"] == "Confirmed interview"
    assert sophia["next_interview"]["title"] == "Design interview"


async def test_filters_by_stage_on_the_server(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates", params={"stage": "interview", "limit": 200})
    items = response.json()["items"]
    assert len(items) == 8
    assert {item["stage"] for item in items} == {"interview"}


async def test_filters_by_job_and_search(client: AsyncClient) -> None:
    by_job = (await client.get(f"{API}/candidates", params={"job_id": job_id("Product Designer")})).json()
    assert {item["job"]["title"] for item in by_job["items"]} == {"Product Designer"}

    by_skill = (await client.get(f"{API}/candidates", params={"search": "pytorch", "stage": "interview"})).json()
    assert {item["candidate"]["full_name"] for item in by_skill["items"]} == {"Aisha Khan", "Omar Haddad"}


async def test_pagination(client: AsyncClient) -> None:
    first = (await client.get(f"{API}/candidates", params={"limit": 5})).json()
    second = (await client.get(f"{API}/candidates", params={"limit": 5, "offset": 5})).json()
    assert len(first["items"]) == 5
    assert first["items"][0]["application_id"] != second["items"][0]["application_id"]
    assert second["offset"] == 5


async def test_list_rejects_an_unknown_stage(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates", params={"stage": "applied"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_follow_ups_come_from_the_rules(client: AsyncClient) -> None:
    items = (await client.get(f"{API}/candidates", params={"limit": 200})).json()["items"]
    reasons = {item["candidate"]["first_name"]: item["engagement"]["follow_up_reason"] for item in items}
    assert reasons["Daniel"] == "No outreach sent yet"
    assert reasons["Diego"] == "Interview feedback is overdue"
    assert reasons["Hana"] == "No reply in 4 days"
    assert reasons["Sophia"] is None


# GET /candidates/{id}


async def test_detail_has_everything_the_panel_shows(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates/{candidate_id(SOPHIA)}")
    assert response.status_code == 200
    detail = response.json()
    assert detail["candidate"]["full_name"] == "Sophia Martinez"
    assert detail["candidate"]["skills"][0] == "Figma"
    assert detail["application"]["id"] == application_id(SOPHIA)
    assert detail["stage"] == "interview"
    assert detail["job"]["title"] == "Product Designer"
    assert detail["engagement"]["level"] == "high"
    assert detail["next_interview"]["title"] == "Design interview"
    assert detail["next_interview"]["confirmed_at"] is not None
    assert len(detail["interviews"]) == 2
    assert len(detail["messages"]) == 4
    assert detail["ai_analysis"] is None

    activity = detail["activity"]
    assert activity[0]["title"] == "Confirmed interview"
    assert [a["created_at"] for a in activity] == sorted((a["created_at"] for a in activity), reverse=True)
    assert [h["new_stage"] for h in detail["stage_history"]] == ["interview", "screening", "sourced"]


async def test_detail_404s_for_unknown_candidates(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["error"] == {"code": "not_found", "message": "Candidate not found.", "details": None}


async def test_detail_rejects_malformed_ids(client: AsyncClient) -> None:
    response = await client.get(f"{API}/candidates/not-a-uuid")
    assert response.status_code == 422


async def test_detail_rejects_another_candidates_application(client: AsyncClient) -> None:
    response = await client.get(
        f"{API}/candidates/{candidate_id(SOPHIA)}", params={"application_id": application_id("james-park")}
    )
    assert response.status_code == 404


# POST /candidates


NEW_CANDIDATE = {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "email": "Ada.Lovelace@Example.com",
    "location": "London, UK",
    "skills": ["Python", "Statistics"],
    "stage": "screening",
}


async def test_create_candidate_with_an_application(client: AsyncClient) -> None:
    response = await client.post(f"{API}/candidates", json={**NEW_CANDIDATE, "job_id": job_id("Data Scientist")})
    assert response.status_code == 201
    detail = response.json()
    assert detail["candidate"]["email"] == "ada.lovelace@example.com"
    assert detail["stage"] == "screening"
    assert detail["job"]["title"] == "Data Scientist"
    assert detail["activity"][0]["activity_type"] == "application_created"
    assert detail["stage_history"][0]["previous_stage"] is None
    assert detail["stage_history"][0]["changed_by"] is not None

    listed = (await client.get(f"{API}/candidates", params={"search": "lovelace"})).json()
    assert listed["total"] == 1
    assert listed["items"][0]["application_id"] == detail["application"]["id"]


async def test_create_candidate_without_a_job(client: AsyncClient) -> None:
    response = await client.post(f"{API}/candidates", json=NEW_CANDIDATE)
    assert response.status_code == 201
    assert response.json()["application"] is None


async def test_create_rejects_duplicates_and_bad_input(client: AsyncClient) -> None:
    duplicate = await client.post(f"{API}/candidates", json={**NEW_CANDIDATE, "email": "sophia.martinez@example.com"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "candidate_exists"

    missing_job = await client.post(
        f"{API}/candidates", json={**NEW_CANDIDATE, "job_id": "00000000-0000-0000-0000-000000000000"}
    )
    assert missing_job.status_code == 404

    bad_email = await client.post(f"{API}/candidates", json={**NEW_CANDIDATE, "email": "not-an-email"})
    assert bad_email.status_code == 422
    assert bad_email.json()["error"]["details"][0]["field"] == "email"

    hired = await client.post(
        f"{API}/candidates", json={**NEW_CANDIDATE, "job_id": job_id("Data Scientist"), "stage": "hired"}
    )
    assert hired.status_code == 400
    assert hired.json()["error"]["code"] == "invalid_stage_transition"

    closed = await client.post(f"{API}/candidates", json={**NEW_CANDIDATE, "job_id": job_id("Solutions Engineer")})
    assert closed.status_code == 400
    assert closed.json()["error"]["code"] == "job_closed"


# PATCH /applications/{id}/stage


async def test_stage_change_updates_history_and_activity(client: AsyncClient) -> None:
    response = await client.patch(f"{API}/applications/{application_id(SOPHIA)}/stage", json={"stage": "offer"})
    assert response.status_code == 200
    row = response.json()
    assert row["stage"] == "offer"
    assert row["last_activity"]["title"] == "Moved to Offer"
    assert row["last_activity"]["activity_type"] == "stage_changed"

    detail = (await client.get(f"{API}/candidates/{candidate_id(SOPHIA)}")).json()
    latest = detail["stage_history"][0]
    assert (latest["previous_stage"], latest["new_stage"]) == ("interview", "offer")
    assert detail["activity"][0]["metadata"]["from"] == "interview"

    offers = (await client.get(f"{API}/candidates", params={"stage": "offer", "limit": 200})).json()
    assert application_id(SOPHIA) in {item["application_id"] for item in offers["items"]}


async def test_invalid_stage_transitions_are_400(client: AsyncClient) -> None:
    to_hired = await client.patch(f"{API}/applications/{application_id('james-park')}/stage", json={"stage": "hired"})
    assert to_hired.status_code == 400
    assert to_hired.json()["error"]["code"] == "invalid_stage_transition"
    assert "Offer" in to_hired.json()["error"]["message"]

    same = await client.patch(f"{API}/applications/{application_id(SOPHIA)}/stage", json={"stage": "interview"})
    assert same.status_code == 400

    from_hired = await client.patch(
        f"{API}/applications/{application_id('mateo-garcia')}/stage", json={"stage": "offer"}
    )
    assert from_hired.status_code == 400


async def test_stage_change_validates_input(client: AsyncClient) -> None:
    unknown = await client.patch(
        f"{API}/applications/00000000-0000-0000-0000-000000000000/stage", json={"stage": "offer"}
    )
    assert unknown.status_code == 404
    invalid = await client.patch(f"{API}/applications/{application_id(SOPHIA)}/stage", json={"stage": "maybe"})
    assert invalid.status_code == 422


async def test_archive_and_restore(client: AsyncClient) -> None:
    archived = await client.post(f"{API}/applications/{application_id(SOPHIA)}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert (await client.get(f"{API}/candidates")).json()["total"] == 31

    blocked = await client.patch(f"{API}/applications/{application_id(SOPHIA)}/stage", json={"stage": "offer"})
    assert blocked.json()["error"]["code"] == "application_archived"

    restored = await client.post(f"{API}/applications/{application_id(SOPHIA)}/restore")
    assert restored.json()["archived_at"] is None
    assert (await client.get(f"{API}/candidates")).json()["total"] == 32


# Activity and messages


async def test_activity_is_newest_first(client: AsyncClient) -> None:
    response = await client.get(f"{API}/applications/{application_id(SOPHIA)}/activity")
    assert response.status_code == 200
    activity = response.json()
    assert activity[0]["title"] == "Confirmed interview"
    assert activity[-1]["activity_type"] == "application_created"
    assert (await client.get(f"{API}/applications/00000000-0000-0000-0000-000000000000/activity")).status_code == 404


async def test_messages_inbox_send_and_read(client: AsyncClient) -> None:
    conversations = (await client.get(f"{API}/messages/conversations")).json()
    assert len(conversations) == 9
    assert conversations[0]["candidate"]["full_name"] == "Sophia Martinez"
    assert (await client.get(f"{API}/messages/unread-count")).json() == {"count": 3}

    sent = await client.post(
        f"{API}/applications/{application_id(SOPHIA)}/messages", json={"content": "See you tomorrow!"}
    )
    assert sent.status_code == 201
    assert sent.json()["sender_type"] == "recruiter"

    assert (await client.post(f"{API}/applications/{application_id(SOPHIA)}/messages/read")).status_code == 204
    assert (await client.get(f"{API}/messages/unread-count")).json() == {"count": 2}

    activity = (await client.get(f"{API}/applications/{application_id(SOPHIA)}/activity")).json()
    assert activity[0]["activity_type"] == "message_sent"

    empty = await client.post(f"{API}/applications/{application_id(SOPHIA)}/messages", json={"content": "  "})
    assert empty.status_code == 422


async def test_dashboard_summary(client: AsyncClient) -> None:
    response = await client.get(f"{API}/dashboard/summary")
    assert response.status_code == 200
    trends = response.json()["trends"]
    assert set(trends) == {"total", "interviews", "follow_up", "offers"}
    assert trends["follow_up"] is None
