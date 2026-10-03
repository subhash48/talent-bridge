"""Staff façade: application message threads (ARCHITECTURE.md 8.2). Guard: require_staff.

Planned endpoints (prefix /v1/applications, staff side):
    GET|POST /{application_id}/messages
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/applications", tags=["messages"])
