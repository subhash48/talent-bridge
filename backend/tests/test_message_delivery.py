"""Sending a recruiter's message: the candidate portal, the timeline (the audit entry) and the delivery
record at once, then email when a provider is configured."""

from httpx import AsyncClient

from tests.conftest import API, FakeEmail, application_id, use_email

SOPHIA_APP = application_id("sophia-martinez")
SUBJECT = "Your Product Designer application at Encord"


async def send(client: AsyncClient, content: str, **extra: str) -> dict:
    response = await client.post(f"{API}/applications/{SOPHIA_APP}/messages", json={"content": content, **extra})
    assert response.status_code == 201
    return response.json()


async def test_without_email_the_message_reaches_the_portal_and_says_so(client: AsyncClient) -> None:
    message = await send(client, "Hi Sophia, the panel is confirmed for tomorrow.")
    assert message["delivery"] == {"subject": SUBJECT, "email_status": "not_configured", "error": None, "sent_at": None}

    thread = (await client.get(f"{API}/applications/{SOPHIA_APP}/messages")).json()
    assert thread[-1]["id"] == message["id"] and thread[-1]["delivery"]["email_status"] == "not_configured"
    assert all(m["delivery"] is None for m in thread if m["sender_type"] == "candidate")
    conversations = (await client.get(f"{API}/messages/conversations")).json()
    sophia = next(c for c in conversations if c["candidate"]["application_id"] == SOPHIA_APP)
    assert sophia["messages"][-1]["delivery"]["email_status"] == "not_configured"

    portal = (await client.get(f"{API}/candidate/messages")).json()["messages"]
    assert portal[-1]["content"] == "Hi Sophia, the panel is confirmed for tomorrow."
    assert "delivery" not in portal[-1]  # the candidate never sees delivery records

    [entry] = [
        a
        for a in (await client.get(f"{API}/applications/{SOPHIA_APP}/activity")).json()
        if a["activity_type"] == "message_sent" and (a.get("metadata") or {}).get("message_id") == message["id"]
    ]
    assert entry["metadata"]["sent_by"] == "Alex Chen"


async def test_with_email_configured_the_message_is_emailed_too(client: AsyncClient) -> None:
    email = use_email(FakeEmail())
    message = await send(client, "Hi Sophia, see you tomorrow.", subject="Tomorrow's design interview")
    delivery = message["delivery"]
    assert (delivery["email_status"], delivery["subject"], delivery["error"]) == (
        "sent",
        "Tomorrow's design interview",
        None,
    )
    assert delivery["sent_at"] is not None
    assert isinstance(email, FakeEmail)
    [sent] = email.sent
    assert (sent.to, sent.subject, sent.idempotency_key) == (
        "sophia.martinez@example.com",
        "Tomorrow's design interview",
        message["id"],
    )
    assert sent.text.startswith("Hi Sophia, see you tomorrow.\n\n--\n")
    assert "http://localhost:3000/candidate/messages" in sent.text and "Encord · Product Designer" in sent.text


async def test_a_failed_email_keeps_the_portal_message_and_shows_why(client: AsyncClient) -> None:
    use_email(FakeEmail(fail="The email service refused the email (422): domain not verified"))
    message = await send(client, "Hi Sophia, a quick update.")
    assert message["delivery"]["email_status"] == "failed"
    assert message["delivery"]["error"] == "The email service refused the email (422): domain not verified"
    portal = (await client.get(f"{API}/candidate/messages")).json()["messages"]
    assert portal[-1]["content"] == "Hi Sophia, a quick update."


async def test_an_archived_candidate_gets_nothing(client: AsyncClient) -> None:
    email = use_email(FakeEmail())
    assert (await client.post(f"{API}/applications/{SOPHIA_APP}/archive")).status_code == 200
    refused = await client.post(f"{API}/applications/{SOPHIA_APP}/messages", json={"content": "Hello"})
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "application_archived"
    assert isinstance(email, FakeEmail) and email.sent == []


async def test_a_message_confirmed_in_the_assistant_takes_the_same_path(client: AsyncClient) -> None:
    email = use_email(FakeEmail())
    proposed = await client.post(
        f"{API}/assistant/requests",
        # From her Encord application's page: she has applications at four employers.
        json={
            "text": "Send Sophia a message asking her to schedule a 30-minute call next Tuesday.",
            "context": {"application_id": SOPHIA_APP},
        },
    )
    assert proposed.status_code == 200 and proposed.json()["status"] == "proposed"
    confirmed = (await client.post(f"{API}/assistant/actions/{proposed.json()['id']}/confirm", json={})).json()
    assert confirmed["status"] == "completed"
    assert (
        confirmed["reply"] == "Sent to **Sophia Martinez**. It was emailed and is in their candidate portal messages."
    )
    assert isinstance(email, FakeEmail)
    [sent] = email.sent
    assert sent.to == "sophia.martinez@example.com" and sent.subject  # the draft's subject
    thread = (await client.get(f"{API}/applications/{SOPHIA_APP}/messages")).json()
    assert thread[-1]["delivery"]["email_status"] == "sent"
