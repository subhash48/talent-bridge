"""Message data access (ARCHITECTURE.md 7.2, 10.2 L3).

Every method takes a Principal and scopes its query by it: staff by organization_id, candidates by
their own application ids. There are no unscoped methods.
"""

from sqlalchemy.ext.asyncio import AsyncSession


class MessagesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
