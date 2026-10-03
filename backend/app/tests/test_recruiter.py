"""Recruiter workspace API tests.

Planned coverage:
- GET /v1/dashboard returns metrics and rows scoped to the recruiter's organization
- candidate tokens get 404 on every staff route (authorization matrix, ARCHITECTURE.md 10.3)
- PATCH /v1/applications/{id}/stage validates transitions and emits application_stage_changed
"""

import pytest


@pytest.mark.skip(reason="Pending implementation: awaiting structure approval")
def test_dashboard_is_scoped_to_organization() -> None: ...
