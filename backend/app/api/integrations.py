"""Ashby integration endpoints. The workspace works without them."""

from typing import Annotated, Any

from fastapi import APIRouter, Header, Request

from app.core.dependencies import SessionDep
from app.integrations.ashby import AshbyClient

router = APIRouter(prefix="/integrations/ashby", tags=["integrations"])


@router.get("", summary="Ashby connection status")
async def status() -> dict[str, bool]:
    return {"configured": AshbyClient.from_settings().configured}


@router.post("/sync", summary="Pull jobs, candidates and applications from Ashby")
async def sync(session: SessionDep) -> dict[str, Any]:
    """503 until ASHBY_API_KEY is set."""
    client = AshbyClient.from_settings()
    return {
        "jobs": await client.sync_jobs(session),
        "candidates": await client.sync_candidates(session),
        "applications": await client.sync_applications(session),
    }


@router.post("/webhook", status_code=202, summary="Ashby webhook receiver")
async def webhook(
    request: Request, ashby_signature: Annotated[str | None, Header(alias="Ashby-Signature")] = None
) -> dict[str, Any]:
    """Verified with ASHBY_WEBHOOK_SECRET; 401 on a bad signature, 503 until configured."""
    return await AshbyClient.from_settings().handle_webhook(await request.body(), ashby_signature)
