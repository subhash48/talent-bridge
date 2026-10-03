"""Engagement read model and the scheduler sweep (ARCHITECTURE.md 5.5, 5.7, 8.2, 8.4).

Planned endpoints (prefix /v1):
    GET  /applications/{application_id}/engagement    (require_staff)
    POST /internal/sweep                              (cron secret)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["engagement"])
