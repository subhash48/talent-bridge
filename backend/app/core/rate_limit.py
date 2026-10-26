"""A per-address limit for the public forms (the contact form, applying on the careers site).

Counted in this process's memory, per client address, over a sliding window: enough to stop one sender
flooding a form, without storing anything. Several API processes each count their own, so the real limit is a
multiple of this one; it's a guard against floods, not an exact quota.
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError


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

    def check(self, client: str) -> None:
        """Count one more from this client, or refuse it (429) when it has reached the limit."""
        now = time.monotonic()
        seen = self._seen[client]
        while seen and now - seen[0] > self.window_seconds:
            seen.popleft()
        if len(seen) >= self.limit:
            raise TooManyRequests(self.message, code=self.code)
        seen.append(now)


def client_address(request: Request) -> str:
    """Who's sending: the first address a proxy forwarded for, else the connection's."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")
