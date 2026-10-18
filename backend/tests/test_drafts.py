"""AI drafts of candidate updates: written for a reason, edited and approved by a recruiter, sent once."""

import json
import uuid
from typing import Any

import httpx
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models import MessageDelivery
from app.services.ai.client import get_ai_provider
from app.services.ai.groq import GroqProvider
from tests.conftest import API, FakeEmail, application_id, use_email

SOPHIA_APP = application_id("sophia-martinez")
FEEDBACK = "Strong design systems thinking"  # interviewer feedback on her portfolio review


async def move(client: AsyncClient, stage: str, reason: str | None = None) -> None:
    response = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": stage, "reason": reason})
    assert response.status_code == 200


async def draft(client: AsyncClient, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/communication/drafts", json={"application_id": SOPHIA_APP, **body})
    assert response.status_code == 201, response.text
    return response.json()


async def thread(client: AsyncClient) -> list[dict[str, Any]]:
    return (await client.get(f"{API}/applications/{SOPHIA_APP}/messages")).json()


async def sophia_on_attention_list(client: AsyncClient) -> dict[str, Any] | None:
    items = (await client.get(f"{API}/communication/attention")).json()["items"]
    return next((item for item in items if item["candidate"]["application_id"] == SOPHIA_APP), None)


async def test_a_draft_is_written_for_the_reason_that_needs_attention(client: AsyncClient) -> None:
    await move(client, "offer")
    before = len(await thread(client))
    written = await draft(client)
    assert (written["reason"], written["status"], written["edited"], written["model_name"]) == (
        "stage_update",
        "drafted",
        False,
        "mock",
    )
    assert written["body"].startswith("Hi Sophia,") and "finalising the details of your offer" in written["body"]
    assert len(await thread(client)) == before  # drafting sends nothing

    listed = await sophia_on_attention_list(client)
    assert listed is not None and listed["draft"]["id"] == written["id"]


async def test_editing_and_approving_a_draft_sends_it_once(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    email = use_email(FakeEmail())
    await move(client, "offer")
    written = await draft(client)
    body = "Hi Sophia,\n\nGreat news: the team would like to make you an offer. I'll call you tomorrow.\n\nBest,\nAlex"
    edited = await client.patch(
        f"{API}/communication/drafts/{written['id']}", json={"subject": "Good news", "body": body}
    )
    assert edited.status_code == 200 and edited.json()["edited"]

    sent = await client.post(f"{API}/communication/drafts/{written['id']}/send", json={})
    assert sent.status_code == 200
    result = sent.json()
    assert (result["draft"]["status"], result["draft"]["message_id"]) == ("sent", result["message"]["id"])
    assert result["message"]["content"] == body
    assert (result["message"]["delivery"]["email_status"], result["message"]["delivery"]["subject"]) == (
        "sent",
        "Good news",
    )
    assert isinstance(email, FakeEmail) and [e.subject for e in email.sent] == ["Good news"]
    assert (await thread(client))[-1]["id"] == result["message"]["id"]
    async with sessions() as session:
        delivery = await session.scalar(
            select(MessageDelivery).where(MessageDelivery.message_id == uuid.UUID(result["message"]["id"]))
        )
    assert delivery is not None and str(delivery.draft_id) == written["id"]
    assert await sophia_on_attention_list(client) is None  # told

    again = await client.post(f"{API}/communication/drafts/{written['id']}/send", json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "draft_already_handled"
    late_edit = await client.patch(f"{API}/communication/drafts/{written['id']}", json={"subject": "x", "body": "y"})
    assert late_edit.status_code == 409
    assert len(email.sent) == 1


async def test_last_edits_can_come_with_the_approval(client: AsyncClient) -> None:
    written = await draft(client, reason="manual")
    sent = (
        await client.post(f"{API}/communication/drafts/{written['id']}/send", json={"body": "Hi Sophia, see you soon."})
    ).json()
    assert sent["message"]["content"] == "Hi Sophia, see you soon." and sent["draft"]["edited"]
    assert sent["message"]["delivery"]["email_status"] == "not_configured"  # portal only, and it says so


async def test_a_new_draft_replaces_the_open_one(client: AsyncClient) -> None:
    first = await draft(client, reason="manual")
    second = await draft(client, reason="no_recent_update")
    open_drafts = (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json()
    assert [d["id"] for d in open_drafts] == [second["id"]]
    assert (await client.post(f"{API}/communication/drafts/{first['id']}/send")).status_code == 409

    discarded = await client.post(f"{API}/communication/drafts/{second['id']}/discard")
    assert discarded.status_code == 200 and discarded.json()["status"] == "discarded"
    assert (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json() == []


async def test_a_reply_to_the_candidates_message(client: AsyncClient) -> None:
    written = await draft(client, reason="unanswered_question")
    assert written["reason"] == "unanswered_question"
    assert "Thanks for your message, and sorry to keep you waiting." in written["body"]


async def test_a_rejection_is_kind_and_never_gives_the_reason(client: AsyncClient) -> None:
    await move(client, "rejected", reason="Not enough depth in user research")
    written = await draft(client)
    assert written["reason"] == "stage_update"
    assert "decided not to move forward" in written["body"]
    assert "research" not in written["body"].lower()


async def test_the_drafting_prompt_never_holds_feedback_or_internal_notes(client: AsyncClient) -> None:
    await move(client, "rejected", reason="Not enough depth in user research")
    prompts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        prompts.append(json.loads(request.content)["messages"][-1]["content"])
        reply = {"subject": "Your application", "body": "Hi Sophia,\n\nThank you for your time.\n\nBest,\nAlex"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]})

    app.dependency_overrides[get_ai_provider] = lambda: GroqProvider(
        api_key="k", model="llama", transport=httpx.MockTransport(handler)
    )
    written = await draft(client)
    assert written["model_name"] == "llama"
    [prompt] = prompts
    assert "Portfolio review" in prompt  # what happened, by title
    assert FEEDBACK not in prompt and "Feedback:" not in prompt
    assert "Not enough depth in user research" not in prompt
    assert "Needs follow-up" not in prompt
    assert "never mention interview feedback" in prompt


async def test_archived_candidates_get_no_drafts_and_no_sends(client: AsyncClient) -> None:
    written = await draft(client, reason="manual")
    assert (await client.post(f"{API}/applications/{SOPHIA_APP}/archive")).status_code == 200
    refused = await client.post(f"{API}/communication/drafts/{written['id']}/send", json={})
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "application_archived"
    still_open = (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json()
    assert [d["status"] for d in still_open] == ["drafted"]  # the refused send left it a draft
    new = await client.post(f"{API}/communication/drafts", json={"application_id": SOPHIA_APP})
    assert new.status_code == 400


async def test_drafts_validate_their_input(client: AsyncClient) -> None:
    bad_reason = await client.post(f"{API}/communication/drafts", json={"application_id": SOPHIA_APP, "reason": "x"})
    assert bad_reason.status_code == 422
    written = await draft(client, reason="manual")
    empty = await client.patch(f"{API}/communication/drafts/{written['id']}", json={"subject": "", "body": "Hi"})
    assert empty.status_code == 422
    missing = await client.post(f"{API}/communication/drafts/00000000-0000-0000-0000-000000000000/send", json={})
    assert missing.status_code == 404
