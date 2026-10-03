"""Staff façade: dashboard and candidate search (ARCHITECTURE.md 8.2). Guard: require_staff.

Planned endpoints (prefix /v1):
    GET /dashboard
    GET /candidates
    GET /candidates/{candidate_id}
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["recruiter"])
