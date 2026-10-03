from httpx import AsyncClient

from tests.conftest import API


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_unknown_route_uses_the_error_shape(client: AsyncClient) -> None:
    response = await client.get(f"{API}/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_cors_allows_the_frontend(client: AsyncClient) -> None:
    response = await client.options(
        f"{API}/candidates",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


async def test_me_is_the_demo_recruiter(client: AsyncClient) -> None:
    response = await client.get(f"{API}/me")
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Alex Chen"
    assert body["role"] == "recruiter"
    assert body["organization"] == "Encord"
