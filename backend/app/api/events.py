"""Candidate telemetry ingestion (ARCHITECTURE.md 9.3). Guard: require_candidate.

Only CLIENT_EMITTABLE event types are accepted; everything else is emitted by the server.

Planned endpoints (prefix /v1/events):
    POST /    (allowlisted candidate telemetry)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/events", tags=["events"])
