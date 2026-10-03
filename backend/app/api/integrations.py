"""Ashby integration endpoints. The workspace works without them."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request

from app.core.dependencies import SessionDep, require_recruiter
from app.integrations.ashby import AshbyClient

router = APIRouter(prefix="/integrations/ashby", tags=["integrations"])


@router.get("", dependencies=[Depends(require_recruiter)], summary="Ashby connection status")
async def status() -> dict[str, bool]:
    return {"configured": AshbyClient.from_settings().configured}


@router.post(
    "/sync",
    dependencies=[Depends(require_recruiter)],
    summary="Pull jobs, candidates and applications from Ashby",
)
async def sync(session: SessionDep) -> dict[str, Any]:
    """503 until ASHBY_API_KEY is set."""
    client = AshbyClient.from_settings()
    return {
        "jobs": await client.sync_jobs(session),
        "candidates": await client.sync_candidates(session),
        "applications": await client.sync_applications(session),
    }


# No sign-in: Ashby calls this, and the request is verified by its signature instead.
@router.post("/webhook", status_code=202, summary="Ashby webhook receiver")
async def webhook(
    request: Request, ashby_signature: Annotated[str | None, Header(alias="Ashby-Signature")] = None
) -> dict[str, Any]:
    """Verified with ASHBY_WEBHOOK_SECRET; 401 on a bad signature, 503 until configured."""
    return await AshbyClient.from_settings().handle_webhook(await request.body(), ashby_signature)
