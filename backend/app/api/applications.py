"""Staff façade: application record, stage, timeline and notes (ARCHITECTURE.md 8.2).

Guard: require_staff. Stage changes go through orchestration (5.6).

Planned endpoints (prefix /v1/applications):
    GET      /{application_id}
    PATCH    /{application_id}/stage
    GET      /{application_id}/events
    GET|POST /{application_id}/notes
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/applications", tags=["applications"])
