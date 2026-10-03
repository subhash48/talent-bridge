import hashlib
import hmac

from httpx import AsyncClient

from app.integrations.ashby import AshbyClient
from tests.conftest import API


async def test_the_app_works_without_ashby(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/integrations/ashby")).json() == {"configured": False}
    sync = await client.post(f"{API}/integrations/ashby/sync")
    assert sync.status_code == 503
    assert sync.json()["error"]["code"] == "ashby_not_configured"
    webhook = await client.post(f"{API}/integrations/ashby/webhook", content=b"{}")
    assert webhook.status_code == 503


async def test_webhook_signatures() -> None:
    client = AshbyClient(api_key=None, webhook_secret="s3cret")
    body = b'{"action": "applicationUpdate"}'
    signature = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert client.verify_signature(body, signature)
    assert not client.verify_signature(body, "sha256=forged")
    assert await client.handle_webhook(body, signature) == {"status": "received", "action": "applicationUpdate"}
