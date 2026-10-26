"""Supabase Auth's admin API, against a fake HTTP transport: the links TalentBridge emails itself."""

import json
import uuid
from typing import Any

import httpx
import pytest

from app.integrations.supabase_admin import AuthUserExists, SupabaseAdmin, SupabaseAdminError

USER = uuid.uuid4()
LINK = "https://project.supabase.co/auth/v1/verify?token=abc&type=invite&redirect_to=http://localhost:3000"


def admin(handler: Any) -> tuple[SupabaseAdmin, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return SupabaseAdmin("https://project.supabase.co/", "sb_secret_test", transport=httpx.MockTransport(record)), seen


async def test_an_invitation_link_is_handed_back_and_nothing_is_emailed() -> None:
    client, seen = admin(
        lambda _: httpx.Response(200, json={"id": str(USER), "email": "Ana@Inbox.dev", "action_link": LINK})
    )
    invited = await client.invite_link(
        "ana@inbox.dev", redirect_to="http://localhost:3000/auth/callback", data={"x": 1}
    )
    assert (invited.id, invited.email, invited.action_link) == (USER, "ana@inbox.dev", LINK)
    [request] = seen
    assert request.url.path == "/auth/v1/admin/generate_link"
    assert request.headers["apikey"] == "sb_secret_test" and "authorization" not in request.headers
    assert json.loads(request.content) == {
        "type": "invite",
        "email": "ana@inbox.dev",
        "data": {"x": 1},
        "redirect_to": "http://localhost:3000/auth/callback",
    }


async def test_older_responses_nest_the_link_and_the_user() -> None:
    body = {"user": {"id": str(USER)}, "properties": {"action_link": LINK}}
    client, _ = admin(lambda _: httpx.Response(200, json=body))
    assert (await client.invite_link("ana@inbox.dev", redirect_to="x", data={})).id == USER
    assert await client.sign_in_link_url("ana@inbox.dev", redirect_to="x") == LINK


async def test_a_sign_in_link_for_an_existing_account() -> None:
    client, seen = admin(lambda _: httpx.Response(200, json={"action_link": LINK}))
    assert await client.sign_in_link_url("ana@inbox.dev", redirect_to="http://localhost:3000/c") == LINK
    assert json.loads(seen[0].content)["type"] == "magiclink"


@pytest.mark.parametrize(
    ("status", "body", "error"),
    [
        (
            422,
            {"error_code": "email_exists", "msg": "A user with this email address has already been registered"},
            AuthUserExists,
        ),
        (429, {"msg": "rate limit"}, SupabaseAdminError),
        (401, {}, SupabaseAdminError),
        (500, {}, SupabaseAdminError),
        (200, {"id": str(USER)}, SupabaseAdminError),  # no link
        (200, {"id": str(USER), "action_link": "javascript:alert(1)"}, SupabaseAdminError),
    ],
)
async def test_failures_are_said_safely(status: int, body: dict[str, Any], error: type[Exception]) -> None:
    client, _ = admin(lambda _: httpx.Response(status, json=body))
    with pytest.raises(error) as raised:
        await client.invite_link("ana@inbox.dev", redirect_to="x", data={})
    assert "sb_secret_test" not in str(raised.value) and "token=" not in str(raised.value)


async def test_an_unreachable_supabase_is_an_error_not_a_crash() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    client, _ = admin(down)
    with pytest.raises(SupabaseAdminError, match="Couldn't reach Supabase Auth"):
        await client.sign_in_link_url("ana@inbox.dev", redirect_to="x")
