from __future__ import annotations

import base64
import binascii
import re
import string
from typing import List, Tuple


# =========================================================
# CANDIDATE DETECTION (IMPROVED)
# =========================================================

BASE64_CANDIDATE_RE = re.compile(
    r"(?<![A-Za-z0-9+/=])([A-Za-z0-9+/]{24,}={0,2})(?![A-Za-z0-9+/=])"
)


# =========================================================
# SAFE CONFIG
# =========================================================

MAX_RECURSION_DEPTH = 3
MAX_PAYLOAD_SIZE = 50_000  # prevent memory abuse


# =========================================================
# UTILS
# =========================================================

def _printable_ratio(value: str) -> float:
    if not value:
        return 0.0
    printable = sum(1 for char in value if char.isprintable())
    return printable / len(value)


def _readable_text_ratio(value: str) -> float:
    if not value:
        return 0.0
    readable = sum(1 for char in value if char in string.printable or char.isprintable())
    return readable / len(value)


def _is_likely_suspicious(decoded: str) -> bool:
    """
    Lightweight post-decode heuristic BEFORE sending to detectors.
    """
    lowered = decoded.lower()

    suspicious_signals = [
        "ignore previous",
        "bypass",
        "transfer",
        "wire",
        "execute",
        "system prompt",
        "admin",
        "token",
        "api key",
    ]

    return any(sig in lowered for sig in suspicious_signals)


# =========================================================
# SINGLE DECODE STEP
# =========================================================

def decode_base64_candidate(candidate: str) -> str | None:
    token = candidate.strip()

    if len(token) % 4 != 0:
        return None

    if len(token) > MAX_PAYLOAD_SIZE:
        return None

    try:
        decoded_bytes = base64.b64decode(token, validate=True)
    except (binascii.Error, ValueError):
        return None

    decoded = decoded_bytes.decode("utf-8", errors="strict").strip()

    if not decoded:
        return None

    if _printable_ratio(decoded) < 0.65:
        return None

    return decoded


def is_base64_like(text: str) -> bool:
    """
    Conservative whole-payload Base64 check.
    Security-sensitive: this avoids decoding arbitrary prose as Base64 and
    sending noisy decoded bytes into downstream prompt-injection detectors.
    """
    raw = str(text or "").strip()
    if re.search(r"\s", raw):
        segments = [segment for segment in re.split(r"\s+", raw) if segment]
        if len(segments) > 1 and max(len(segment) for segment in segments) < 16:
            return False
    token = re.sub(r"\s+", "", raw)
    if len(token) < 16 or len(token) > MAX_PAYLOAD_SIZE:
        return False
    if len(token) % 4 != 0:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", token))


def safe_decode_base64(text: str) -> str | None:
    token = re.sub(r"\s+", "", str(text or "").strip())
    if not is_base64_like(token):
        return None
    try:
        decoded_bytes = base64.b64decode(token, validate=True)
        decoded = decoded_bytes.decode("utf-8", errors="strict").strip()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    if not decoded or _readable_text_ratio(decoded) < 0.75:
        return None
    return decoded


# =========================================================
# RECURSIVE DECODER (CRITICAL UPGRADE)
# =========================================================

def recursive_decode_base64(
    content: str,
    *,
    depth: int = 0
) -> List[Tuple[str, str, int]]:
    """
    Returns:
        List of tuples:
        (original, decoded, depth_level)
    """

    if depth >= MAX_RECURSION_DEPTH:
        return []

    decodes: List[Tuple[str, str, int]] = []

    for match in BASE64_CANDIDATE_RE.finditer(content):
        candidate = match.group(1)

        decoded = decode_base64_candidate(candidate)
        if not decoded:
            continue

        decodes.append((candidate, decoded, depth))

        # -------------------------------------------------
        # RECURSIVE STEP (CRITICAL SECURITY FEATURE)
        # -------------------------------------------------
        nested_decodes = recursive_decode_base64(decoded, depth=depth + 1)
        decodes.extend(nested_decodes)

    return decodes


def extract_base64_decodes(content: str) -> List[Tuple[str, str]]:
    """
    Backward-compatible adapter used by decodeLayer.
    """
    decodes = recursive_decode_base64(content, depth=0)
    flattened: List[Tuple[str, str]] = []
    seen: set[Tuple[str, str]] = set()

    for original, decoded, _depth in decodes:
        pair = (original, decoded)
        if pair in seen:
            continue
        seen.add(pair)
        flattened.append(pair)

    return flattened
