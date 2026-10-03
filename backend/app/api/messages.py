"""Message threads. Recruiters send; the AI only drafts (see /ai/draft-message)."""

from uuid import UUID

from fastapi import APIRouter, Response

from app.core.dependencies import CurrentUserDep, SessionDep
from app.schemas.message import Conversation, MessageCreate, MessageRead, UnreadCount
from app.services import message_service

router = APIRouter(tags=["messages"])


@router.get("/messages/conversations", response_model=list[Conversation], summary="Inbox")
async def list_conversations(session: SessionDep) -> list[Conversation]:
    """Threads in the active pipeline, most recent message first."""
    return await message_service.list_conversations(session)


@router.get("/messages/unread-count", response_model=UnreadCount, summary="Unread threads")
async def unread_count(session: SessionDep) -> UnreadCount:
    return UnreadCount(count=await message_service.unread_thread_count(session))


@router.get("/applications/{application_id}/messages", response_model=list[MessageRead], summary="Thread")
async def list_messages(application_id: UUID, session: SessionDep) -> list[MessageRead]:
    """Oldest first."""
    return await message_service.list_messages(session, application_id)


@router.post(
    "/applications/{application_id}/messages",
    response_model=MessageRead,
    status_code=201,
    summary="Send a message",
)
async def send_message(
    application_id: UUID, body: MessageCreate, session: SessionDep, user: CurrentUserDep
) -> MessageRead:
    return await message_service.send_message(session, application_id, body.content, user)


@router.post("/applications/{application_id}/messages/read", status_code=204, summary="Mark thread read")
async def mark_read(application_id: UUID, session: SessionDep) -> Response:
    await message_service.mark_read(session, application_id)
    return Response(status_code=204)
