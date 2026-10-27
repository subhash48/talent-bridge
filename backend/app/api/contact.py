"""The public website's contact form: public, no sign-in."""

from fastapi import APIRouter, Request

from app.core.dependencies import EmailProviderDep, SessionDep
from app.core.rate_limit import client_address
from app.schemas.contact import ContactCreate, ContactInfo, ContactReceived
from app.services import contact_service

router = APIRouter(prefix="/contact", tags=["contact"])


@router.get("", response_model=ContactInfo, summary="How to reach Kavuntra")
async def contact_info() -> ContactInfo:
    """The official contact address when one is configured (CONTACT_EMAIL; null otherwise), and the
    topics the form offers."""
    return contact_service.info()


@router.post("", response_model=ContactReceived, summary="Send a message to Kavuntra")
async def send_message(
    body: ContactCreate, request: Request, session: SessionDep, email: EmailProviderDep
) -> ContactReceived:
    """Kept, and emailed to CONTACT_EMAIL when email is set up. 429 too_many_messages after a few messages
    in a few minutes from the same address."""
    await contact_service.receive(session, body, email, client_address(request))
    return ContactReceived()
