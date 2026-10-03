"""Application data access (ARCHITECTURE.md 7.2, 10.2 L3).

Every method takes a Principal and scopes its query by it: staff by organization_id, candidates by
their own application ids. There are no unscoped methods.
Also reads and upserts application_insights, the derived read model (5.3).
"""

from sqlalchemy.ext.asyncio import AsyncSession


class ApplicationsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
