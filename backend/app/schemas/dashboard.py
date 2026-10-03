from app.schemas.common import APIModel


class DashboardTrends(APIModel):
    """Percent change over the last 30 days against the 30 before; null when not measurable."""

    total: int | None = None
    interviews: int | None = None
    follow_up: int | None = None
    offers: int | None = None


class DashboardSummary(APIModel):
    trends: DashboardTrends
