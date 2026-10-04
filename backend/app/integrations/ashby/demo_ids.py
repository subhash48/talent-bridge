"""Ids and address checks for the development-only Ashby simulator (demo.py).

Kept apart from demo.py, which builds its payloads from backend/tests and so can only be imported in a
checkout, so that code loaded at startup (demo jobs, the demo careers site) can use them anywhere.
"""

import uuid

DEMO_PREFIX = "tb-demo-"
_NAMESPACE = uuid.UUID("6d1f3c2a-8b4e-4f7a-9c0d-2e5b7a9c1d3f")

# RFC 2606 and 6761 names: no mailbox there, so an invitation would bounce.
_NO_MAIL_DOMAINS = ("example.com", "example.net", "example.org", "example", "test", "invalid", "localhost")


def demo_id(kind: str, *parts: str) -> str:
    """A stable Ashby id for a simulator record: the same inputs always give the same id."""
    key = "|".join(part.strip().lower() for part in parts)
    return f"{DEMO_PREFIX}{kind}-{uuid.uuid5(_NAMESPACE, key)}"


def is_demo(external_id: str | None) -> bool:
    return bool(external_id and external_id.startswith(DEMO_PREFIX))


def can_receive_mail(email: str) -> bool:
    domain = email.rpartition("@")[2]
    return not any(domain == name or domain.endswith(f".{name}") for name in _NO_MAIL_DOMAINS)
