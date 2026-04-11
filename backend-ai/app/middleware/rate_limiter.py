import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class RateLimiter:
    def __init__(self):
        self._events = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: int):
        now = time.time()
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)


limiter = RateLimiter()


def check_rate_limit(identifier: str, scope: str, limit: int, window_seconds: int):
    limiter.hit(f"{scope}:{identifier}", limit=limit, window_seconds=window_seconds)
