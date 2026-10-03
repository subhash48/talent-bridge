"""Portal façade for candidates (ARCHITECTURE.md 8.3). Guard: require_candidate.

Responses use portal projection models only, so internal fields never leave the API (10.2 L4).

Planned endpoints (prefix /v1/portal):
    GET      /home
    GET      /applications
    GET      /applications/{application_id}
    GET      /interviews
    POST     /interviews/{interview_id}/confirm
    POST     /interviews/{interview_id}/reschedule-request
    GET|POST /applications/{application_id}/messages
    GET      /company
    GET      /team
    GET      /resources
    GET      /documents
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/portal", tags=["candidate"])
