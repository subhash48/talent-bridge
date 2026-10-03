"""Event ingestion tests (ARCHITECTURE.md 9).

Planned coverage:
- POST /v1/events rejects types outside CLIENT_EMITTABLE (422)
- ids, actor and source are server-derived; client-supplied values are ignored
- throttling suppresses duplicate portal_opened and page-view events
"""

import pytest


@pytest.mark.skip(reason="Pending implementation: awaiting structure approval")
def test_rejects_non_client_event_types() -> None: ...
