"""A per-address limit for the public forms (the contact form, applying on the careers site).

Counted in this process's memory, per client address, over a sliding window: enough to stop one sender
flooding a form, without storing anything. Several API processes each count their own, so the real limit is a
multiple of this one; it's a guard against floods, not an exact quota. Addresses not seen for a whole window
are forgotten once many are kept, so the count never grows without end.

The API runs behind one proxy (Railway's), which connects for every visitor and adds the address it was
connected from to the end of X-Forwarded-For. That last entry is the visitor; anything before it is whatever
the visitor sent, so it's never used.
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError

# Past this many addresses, the ones not seen for a whole window are dropped.
MAX_CLIENTS = 10_000


class TooManyRequests(AppError):
    status_code = 429
    code = "too_many_requests"


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float, message: str, code: str = "too_many_requests") -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.message = message
        self.code = code
        self._seen: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str) -> bool:
        """Count one more from this client, unless it has reached the limit (then False, and not counted)."""
        now = time.monotonic()
        seen = self._seen[client]
        while seen and now - seen[0] > self.window_seconds:
            seen.popleft()
        if len(seen) >= self.limit:
            return False
        seen.append(now)
        if len(self._seen) > MAX_CLIENTS:
            self._forget(now)
        return True

    def check(self, client: str) -> None:
        """Count one more from this client, or refuse it (429) when it has reached the limit."""
        if not self.allow(client):
            raise TooManyRequests(self.message, code=self.code)

    def _forget(self, now: float) -> None:
        for client in [client for client, seen in self._seen.items() if now - seen[-1] > self.window_seconds]:
            del self._seen[client]


def client_address(request: Request) -> str:
    """Who's sending: the address our proxy added last to X-Forwarded-For, else the connection's."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    return forwarded or (request.client.host if request.client else "unknown")
