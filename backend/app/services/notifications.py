"""Notifications: in-app only in the MVP; email and SMS later (ARCHITECTURE.md 5.1, 15).

Realtime refreshes do not go through here; clients are pinged via change_feed (5.6).
"""

from uuid import UUID


async def notify_user(user_id: UUID, message: str) -> None:
    raise NotImplementedError  # TODO: in-app notification delivery
