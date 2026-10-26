"""The recruiter assistant: one action engine for typed and spoken requests about candidate
communication (who needs an update, unanswered messages, interviews to confirm or follow up on),
drafts through the same ledger as Today, confirmations that run once, and the boundaries it never
crosses (candidates' access, personal characteristics, ranking)."""

import json
import uuid
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import AssistantActionStatus
from app.main import app
from app.models import Application, AssistantAction, Message
from app.models.base import utcnow
from app.schemas.assistant import AssistantIntent, InterviewDetails
from app.services import message_service
from app.services.ai.client import AIProviderError, get_ai_provider
from app.services.ai.fallback import MockProvider
from app.services.ai.groq import GroqProvider
from app.services.assistant.understand import RANKING_REPLY, SENSITIVE_REPLY
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, job_id

SOPHIA_APP = application_id("sophia-martinez")
INVITE = "Send Sophia a personalized email asking her to schedule a 30-minute recruiter interview next Tuesday."
# Sophia has applications at four employers, so a request that only names her is about the application the
# recruiter has open: her Encord one, as from her candidate page. Without it the assistant asks which one
# (test_one_person_with_several_applications_is_asked_which).
ON_SOPHIAS_PAGE: dict[str, Any] = {"context": {"application_id": SOPHIA_APP}}


async def ask(client: AsyncClient, text: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/assistant/requests", json={"text": text, **body})
    assert response.status_code == 200, response.text
    return response.json()


async def messages_to(sessions: async_sessionmaker[AsyncSession], application: str) -> list[Message]:
    async with sessions() as session:
        return list(
            (
                await session.scalars(
                    select(Message).where(Message.application_id == uuid.UUID(application)).order_by(Message.created_at)
                )
            ).all()
        )


def use_provider(provider: Any) -> None:
    app.dependency_overrides[get_ai_provider] = lambda: provider


# Who may use it


async def test_only_recruiters_reach_the_assistant(anonymous: AsyncClient, client: AsyncClient) -> None:
    candidate = bearer(SOPHIA_AUTH)
    action = uuid.uuid4()
    calls = [
        ("get", "/assistant/status", None),
        ("get", "/assistant/actions", None),
        ("post", "/assistant/requests", {"text": "Who needs an update today?"}),
        ("post", f"/assistant/actions/{action}/confirm", {}),
        ("post", f"/assistant/actions/{action}/cancel", None),
    ]
    for method, path, body in calls:
        kwargs: dict[str, Any] = {"headers": candidate}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(anonymous, method)(f"{API}{path}", **kwargs)).status_code == 403, path
        assert (await getattr(anonymous, method)(f"{API}{path}")).status_code == 401, path
    transcribe = await anonymous.post(
        f"{API}/assistant/transcribe", content=b"audio", headers={**candidate, "content-type": "audio/webm"}
    )
    assert transcribe.status_code == 403
    assert (await client.get(f"{API}/assistant/status")).json() == {"voice_transcription": False, "model_name": "mock"}


# One engine for text and voice


async def test_typed_and_spoken_requests_take_the_same_path(client: AsyncClient) -> None:
    typed = await ask(client, INVITE, **ON_SOPHIAS_PAGE)
    spoken = await ask(client, INVITE, input_type="voice", **ON_SOPHIAS_PAGE)
    assert (
        (typed["intent"], typed["status"])
        == (spoken["intent"], spoken["status"])
        == ("send_interview_email", "proposed")
    )
    assert spoken["input_type"] == "voice" and spoken["transcript"] == INVITE
    strip = lambda card: {k: v for k, v in card.items() if k != "action_id"}
    assert strip(typed["cards"][0]) == strip(spoken["cards"][0])


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
    for text, action in (
        ("Draft a message telling Daniel his interview moved to Thursday.", "draft_message"),
        ("Who needs an update today?", "who_needs_update"),
        ("Which candidates have unanswered questions?", "unanswered"),
        ("Which interviews need confirmation?", "unconfirmed_interviews"),
        ("Who interviewed this week and has not received follow-up?", "no_follow_up"),
        ("Draft Sarah an update.", "draft_message"),
        ("Remind Priya about her interview", "draft_message"),
        ("Is Priya's interview confirmed?", "next_interview"),
        ("Show candidates in screening", "search_candidates"),
        ("Create a Backend Engineer job", "help"),
    ):
        assert parse(text).action == action, text
    assert parse("Draft Sarah an update.").candidate_name == "Sarah"


async def test_a_models_reading_is_used_and_a_failed_one_falls_back(client: AsyncClient) -> None:
    class Reader(MockProvider):
        name, model = "reader", "reader-1"

        async def understand_request(self, text: str, context: str) -> AssistantIntent:
            return AssistantIntent(action="who_needs_update")

    use_provider(Reader())
    answer = await ask(client, "whatever the words, the model said: who needs an update")
    assert (answer["intent"], answer["model_name"]) == ("who_needs_update", "reader-1")

    class Broken(MockProvider):
        name, model = "broken", "broken-1"

        async def understand_request(self, text: str, context: str) -> AssistantIntent:
            raise AIProviderError("down")

    use_provider(Broken())
    answer = await ask(client, "Who needs an update today?")
    assert (answer["intent"], answer["model_name"]) == ("who_needs_update", "rules")


async def test_groq_reads_a_request_as_json() -> None:
    def reply(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert "send_interview_email" in body["messages"][1]["content"]
        content = {"action": "send_interview_email", "mode": "execute", "candidate_name": "Sophia"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    provider = GroqProvider(api_key="test", model="test-model", transport=httpx.MockTransport(reply))
    intent = await provider.understand_request(INVITE, "")
    assert (intent.action, intent.candidate_name, intent.mode) == ("send_interview_email", "Sophia", "execute")


# Messages: proposed, confirmed once, failures reported


async def test_an_interview_invitation_is_written_and_sent_only_when_confirmed(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    answer = await ask(client, INVITE, input_type="voice", client_request_id="voice-request-0001", **ON_SOPHIAS_PAGE)
    [card] = answer["cards"]
    assert card["type"] == "message" and card["status"] == "proposed" and card["mode"] == "execute"
    assert (card["candidate"]["name"], card["candidate"]["job_title"]) == ("Sophia Martinez", "Product Designer")
    assert (card["interview_type"], card["duration_minutes"], card["timeframe"]) == (
        "Recruiter interview",
        30,
        "next Tuesday",
    )
    assert card["body"].startswith("Hi Sophia,\n\nThanks again for your interest in the Product Designer role.")
    assert "30-minute recruiter interview next Tuesday" in card["body"]
    assert card["body"].endswith("Best,\nAlex")
    assert answer["context"] == {"application_id": SOPHIA_APP, "action_id": answer["id"]}
    assert len(await messages_to(sessions, SOPHIA_APP)) == before  # nothing sent yet

    confirmed = await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "completed"
    sent = await messages_to(sessions, SOPHIA_APP)
    assert len(sent) == before + 1 and sent[-1].content == card["body"]

    again = await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "action_already_handled"
    assert len(await messages_to(sessions, SOPHIA_APP)) == before + 1  # one confirmation, one message

    [recent] = (await client.get(f"{API}/assistant/actions")).json()
    assert recent["summary"] == "Sent interview invitation to Sophia Martinez"
    assert (recent["input_type"], recent["input_text"], recent["intent"], recent["status"]) == (
        "voice",
        INVITE,
        "send_interview_email",
        "completed",
    )
    assert recent["href"] == f"/recruiter/candidates/{SOPHIA_APP}"
    # The candidate sees it in their portal messages.
    portal = (await client.get(f"{API}/candidate/messages")).json()
    assert portal["messages"][-1]["content"] == card["body"]


async def test_the_recruiters_edit_is_what_gets_sent(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    answer = await ask(client, INVITE, **ON_SOPHIAS_PAGE)
    edited = "Hi Sophia,\n\nCould you do Tuesday at 2 PM?\n\nBest,\nAlex"
    assert (
        await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={"body": edited})
    ).status_code == 200
    assert (await messages_to(sessions, SOPHIA_APP))[-1].content == edited


async def test_a_failed_send_is_reported_as_a_failure(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    # The application is archived after the proposal: the message service refuses, and so says the result.
    answer = await ask(client, INVITE, **ON_SOPHIAS_PAGE)
    async with sessions() as session:
        await session.execute(
            update(Application).where(Application.id == uuid.UUID(SOPHIA_APP)).values(archived_at=utcnow())
        )
        await session.commit()
    result = (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).json()
    assert result["status"] == "failed"
    assert result["cards"][0]["status"] == "failed" and "Restore Sophia" in result["cards"][0]["error"]
    assert len(await messages_to(sessions, SOPHIA_APP)) == before
    [recent] = (await client.get(f"{API}/assistant/actions")).json()
    assert (recent["status"], recent["summary"]) == ("failed", "Couldn't send message to Sophia Martinez")

    # An unexpected failure is a failure too, never a success.
    async with sessions() as session:
        await session.execute(
            update(Application).where(Application.id == uuid.UUID(SOPHIA_APP)).values(archived_at=None)
        )
        await session.commit()
    answer = await ask(client, INVITE, **ON_SOPHIAS_PAGE)

    async def broken(*_: Any, **__: Any) -> None:
        raise RuntimeError("provider down")

    monkeypatch.setattr(message_service, "send_message", broken)
    result = (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).json()
    assert result["status"] == "failed"
    assert len(await messages_to(sessions, SOPHIA_APP)) == before


async def test_drafting_sends_nothing_and_send_it_asks_for_confirmation(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    before = len(await messages_to(sessions, SOPHIA_APP))
    draft = await ask(client, "Draft an interview email for Sophia.", **ON_SOPHIAS_PAGE)
    assert draft["cards"][0]["mode"] == "draft" and "Nothing has been sent" in draft["reply"]
    escalated = await ask(client, "send it", context=draft["context"])
    assert escalated["intent"] == "confirm"
    assert escalated["cards"][0]["mode"] == "execute" and escalated["cards"][0]["action_id"] == draft["id"]
    assert len(await messages_to(sessions, SOPHIA_APP)) == before  # voice alone never sends

    cancelled = await ask(client, "cancel", context=escalated["context"])
    assert "Nothing was sent" in cancelled["reply"]
    assert (await client.post(f"{API}/assistant/actions/{draft['id']}/confirm", json={})).status_code == 409


async def test_a_message_says_what_the_recruiter_asked(client: AsyncClient) -> None:
    answer = await ask(client, "Draft a message telling Daniel his interview moved to Thursday.")
    card = answer["cards"][0]
    assert card["candidate"]["name"] == "Daniel Lee" and card["purpose"] == "Message"
    assert "your interview moved to Thursday" in card["body"]


async def test_an_ambiguous_name_is_asked_about_never_guessed(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    for first, last, job in (("Alex", "Morgan", "Product Designer"), ("Alex", "Rivera", "ML Engineer")):
        response = await client.post(
            f"{API}/candidates",
            json={
                "first_name": first,
                "last_name": last,
                "email": f"{first}.{last}@example.com".lower(),
                "job_id": job_id(job),
            },
        )
        assert response.status_code == 201
    text = "Send Alex an interview invitation for next week."
    answer = await ask(client, text)
    assert answer["status"] == "needs_clarification"
    [card] = answer["cards"]
    assert card["question"] == "I found 2 candidates named Alex. Which one?"
    assert [(option["label"], option["detail"]) for option in card["options"]] == [
        ("Alex Morgan", "Product Designer at Encord · Sourced"),
        ("Alex Rivera", "ML Engineer at Encord · Sourced"),
    ]
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AssistantAction)
                .where(AssistantAction.status == AssistantActionStatus.PROPOSED)
            )
            == 0
        )

    chosen = card["options"][1]
    picked = await ask(client, chosen["reply"], context={"application_id": chosen["application_id"]})
    assert picked["status"] == "proposed" and picked["cards"][0]["candidate"]["name"] == "Alex Rivera"

    nobody = await ask(client, "Send Zelda an interview invitation.")
    assert nobody["status"] == "answered" and "couldn't find" in nobody["reply"].lower()


async def test_one_person_with_several_applications_is_asked_which(client: AsyncClient) -> None:
    """Sophia applied to four employers. A request that only names her proposes nothing: the recruiter
    picks the application, told apart by role, employer and stage."""
    answer = await ask(client, INVITE)
    assert answer["status"] == "needs_clarification"
    [card] = answer["cards"]
    assert card["question"] == "Sophia Martinez has 4 applications. Which one?"
    assert sorted(option["detail"] for option in card["options"]) == [
        "Product Designer at Anthropic · Sourced",
        "Product Designer at Encord · Interview",
        "Product Designer at OpenAI · Screening",
        "UX Designer at Google · Interview",
    ]
    google = next(option for option in card["options"] if "Google" in option["detail"])
    picked = await ask(client, google["reply"], context={"application_id": google["application_id"]})
    assert picked["status"] == "proposed" and picked["cards"][0]["candidate"]["job_title"] == "UX Designer"


async def test_a_name_spelled_as_it_sounds_is_matched_and_said_so(client: AsyncClient) -> None:
    """Speech transcription writes "Sofia" for Sophia; the reply says how it was read, and sending still
    waits for the recruiter."""
    answer = await ask(
        client, "Send Sofia a personalized email asking her to schedule an interview next Tuesday.", **ON_SOPHIAS_PAGE
    )
    assert answer["status"] == "proposed"
    assert answer["cards"][0]["candidate"]["name"] == "Sophia Martinez"
    assert answer["reply"].startswith("I took “Sofia” to mean Sophia Martinez.")


async def test_a_repeated_request_runs_once(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    first = await ask(client, INVITE, client_request_id="double-click-0001", **ON_SOPHIAS_PAGE)
    second = await ask(client, INVITE, client_request_id="double-click-0001", **ON_SOPHIAS_PAGE)
    assert first == second
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(AssistantAction)) == 1


# Jobs: the same demo jobs as the Jobs page


# Questions


async def test_who_needs_an_update_is_todays_list(client: AsyncClient) -> None:
    attention = (await client.get(f"{API}/communication/attention")).json()["items"]
    answer = await ask(client, "Who needs an update today?")
    [card] = answer["cards"]
    assert (answer["intent"], card["type"], card["href"]) == ("who_needs_update", "follow_ups", "/recruiter/today")
    assert [item["candidate"]["application_id"] for item in card["items"]] == [
        item["candidate"]["application_id"] for item in attention
    ]
    assert card["total"] == len(attention) > 0
    assert f"**{attention[0]['candidate']['full_name']}**" in answer["reply"]
    assert card["items"][0]["reason"] == attention[0]["reasons"][0]["title"]


async def test_unanswered_messages_unconfirmed_interviews_and_missing_follow_ups(client: AsyncClient) -> None:
    unanswered = await ask(client, "Which candidates have unanswered questions?")
    [card] = unanswered["cards"]
    assert unanswered["intent"] == "unanswered" and card["total"] > 0
    for item in card["items"]:
        health = (await client.get(f"{API}/applications/{item['candidate']['application_id']}/communication")).json()
        assert health["open_question"]["excerpt"] == item["detail"]

    unconfirmed = await ask(client, "Which interviews need confirmation?")
    [card] = unconfirmed["cards"]
    names = {item["candidate"]["name"] for item in card["items"]}
    applications = {item["candidate"]["application_id"] for item in card["items"]}
    assert unconfirmed["intent"] == "unconfirmed_interviews"
    assert "Priya Desai" in names and SOPHIA_APP not in applications  # Sophia confirmed her Encord one
    assert application_id("sophia-martinez@google") in applications  # but not yet her Google one
    assert all(item["at"] and item["reason"] == "Not confirmed" for item in card["items"])

    followed = await ask(client, "Who interviewed this week and has not received follow-up?")
    [card] = followed["cards"]
    assert followed["intent"] == "no_follow_up"
    for item in card["items"]:
        health = (await client.get(f"{API}/applications/{item['candidate']['application_id']}/communication")).json()
        assert health["last_interview"]["followed_up"] is False


async def test_draft_an_update_uses_the_drafts_and_sends_once(client: AsyncClient) -> None:
    moved = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": "offer"})
    assert moved.status_code == 200
    answer = await ask(client, "Draft Sophia an update.", **ON_SOPHIAS_PAGE)
    [card] = answer["cards"]
    assert (card["purpose"], card["mode"]) == ("Update", "draft")
    assert "finalising the details of your offer" in card["body"]  # written for the stage change
    [draft] = (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json()
    assert (draft["body"], draft["reason"]) == (card["body"], "stage_update")

    confirmed = (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).json()
    assert confirmed["status"] == "completed"
    assert (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json() == []
    report = (await client.get(f"{API}/communication/analytics")).json()
    assert (report["drafts_generated"], report["drafts_sent"]) == (1, 1)
    assert (await client.post(f"{API}/assistant/actions/{answer['id']}/confirm", json={})).status_code == 409

    # Dismissing a proposed update discards its draft.
    again = await ask(client, "Draft Sophia an update.", **ON_SOPHIAS_PAGE)
    assert (await client.post(f"{API}/assistant/actions/{again['id']}/cancel")).status_code == 204
    assert (await client.get(f"{API}/communication/drafts", params={"application_id": SOPHIA_APP})).json() == []


async def test_personal_characteristics_and_ranking_are_refused(client: AsyncClient) -> None:
    for text in (
        "Did Sophia identify as Asian?",
        "Show candidates who are Hispanic",
        "Draft a message to Sophia about her disability",
    ):
        refused = await ask(client, text)
        assert refused["reply"] == SENSITIVE_REPLY and refused["cards"] == [], text
    ranked = await ask(client, "Rank candidates by engagement")
    assert ranked["reply"] == RANKING_REPLY


async def test_candidates_and_interviews(client: AsyncClient) -> None:
    upcoming = await ask(client, "What interview does Sophia have next?", **ON_SOPHIAS_PAGE)
    assert upcoming["cards"][0]["interview"]["title"] == "Design interview"
    assert "Design interview" in upcoming["reply"] and "confirmed" in upcoming["reply"]

    about = await ask(client, "Tell me about Sophia's application", **ON_SOPHIAS_PAGE)
    assert about["intent"] == "candidate_info" and about["reply"] and about["sources"]

    listed = await ask(client, "Show candidates interviewing for Product Designer")
    expected = (
        await client.get(f"{API}/candidates", params={"stage": "interview", "job_id": job_id("Product Designer")})
    ).json()
    card = listed["cards"][0]
    assert card["total"] == expected["total"] > 0
    assert [item["application_id"] for item in card["items"]] == [item["application_id"] for item in expected["items"]]

    unclear = await ask(client, "Hmm, sing me a song")
    assert unclear["intent"] == "help" and "Who needs an update today?" in unclear["reply"]


# Voice transcription


async def test_transcription_needs_a_provider_and_keeps_nothing(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    unavailable = await client.post(
        f"{API}/assistant/transcribe", content=b"\x1a\x45", headers={"content-type": "audio/webm"}
    )
    assert unavailable.status_code == 503 and unavailable.json()["error"]["code"] == "transcription_unavailable"

    heard: list[tuple[int, str, str]] = []

    class Listener(MockProvider):
        @property
        def can_transcribe(self) -> bool:
            return True

        async def transcribe(self, audio: bytes, content_type: str, vocabulary: str = "") -> str:
            heard.append((len(audio), content_type, vocabulary))
            return INVITE

    use_provider(Listener())
    response = await client.post(
        f"{API}/assistant/transcribe", content=b"\x1a\x45" * 100, headers={"content-type": "audio/webm"}
    )
    assert response.status_code == 200 and response.json()["text"] == INVITE
    assert heard[0][:2] == (200, "audio/webm") and "Sophia Martinez" in heard[0][2]
    assert (await client.get(f"{API}/assistant/status")).json()["voice_transcription"] is True

    not_audio = await client.post(
        f"{API}/assistant/transcribe", content=b"{}", headers={"content-type": "application/json"}
    )
    assert not_audio.status_code == 400
    empty = await client.post(f"{API}/assistant/transcribe", content=b"", headers={"content-type": "audio/webm"})
    assert empty.status_code == 400
    huge = await client.post(
        f"{API}/assistant/transcribe", content=b"\x00" * (8 * 1024 * 1024 + 1), headers={"content-type": "audio/webm"}
    )
    assert huge.status_code == 413
    async with sessions() as session:  # no request was recorded, let alone any audio
        assert await session.scalar(select(func.count()).select_from(AssistantAction)) == 0
