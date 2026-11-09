"""The public website's contact form: public, no sign-in."""

from fastapi import APIRouter, Request

from app.core.dependencies import EmailProviderDep, SessionDep
from app.core.rate_limit import client_address
from app.schemas.contact import ContactCreate, ContactReceived
from app.services import contact_service

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post("", response_model=ContactReceived, summary="Send a message to Hirvello")
async def send_message(
    body: ContactCreate, request: Request, session: SessionDep, email: EmailProviderDep
) -> ContactReceived:
    """Kept, and emailed to the business or support team (by topic) when email is set up. 429
    too_many_messages after a few messages in a few minutes from the same address."""
    await contact_service.receive(session, body, email, client_address(request))
    return ContactReceived()
