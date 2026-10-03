"""Candidate portal API tests.

Planned coverage:
- /v1/portal responses never contain internal fields (notes, feedback, engagement)
- a candidate can only read and act on their own applications and interviews (404 otherwise)
- POST /v1/portal/interviews/{id}/confirm is idempotent and emits interview_confirmed
"""

import pytest


@pytest.mark.skip(reason="Pending implementation: awaiting structure approval")
def test_portal_hides_internal_fields() -> None: ...
