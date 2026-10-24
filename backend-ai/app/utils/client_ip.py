"""Single source of truth for the client IP used by rate limits, audit logs and IP blocks.

Why this exists: behind Render's proxy, `request.client.host` is the proxy, so every user
would share one rate-limit bucket (one attacker can lock everyone out). Trusting the raw
`X-Forwarded-For` is just as bad, because callers can put anything at the left of it.

Proxies APPEND to X-Forwarded-For, so the only entries you can trust are the ones the
proxies in front of you wrote, counted from the RIGHT. Set TRUSTED_PROXY_HOPS to the number
of proxies between the internet and this app (0 = no proxy, use the socket peer).
"""

from __future__ import annotations

import ipaddress

from fastapi import Request

from app.core.config import settings


def _normalize(value: str) -> str | None:
    value = (value or "").strip()
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return None
    if ip.version == 6:
        # Attackers usually control a whole /64: bucket by prefix so rotating addresses doesn't help.
        return f"{ipaddress.ip_network(f'{ip}/64', strict=False).network_address}/64"
    return str(ip)


def get_client_ip(request: Request) -> str:
    peer_raw = request.client.host if request.client else "unknown"
    peer = _normalize(peer_raw) or peer_raw[:64]

    hops = int(getattr(settings, "TRUSTED_PROXY_HOPS", 0) or 0)
    if hops <= 0:
        return peer

    parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if len(parts) < hops:
        return peer
    return _normalize(parts[-hops]) or peer