"""Staff façade: schedule and update interviews (ARCHITECTURE.md 8.2). Guard: require_staff.

Planned endpoints (prefix /v1/interviews):
    GET   /
    POST  /
    PATCH /{interview_id}
    POST  /{interview_id}/complete
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/interviews", tags=["interviews"])
