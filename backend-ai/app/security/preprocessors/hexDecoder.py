from __future__ import annotations

import re
import string
from typing import List, Tuple


# =========================================================
# SAFE CANDIDATE DETECTION
# =========================================================

HEX_CANDIDATE_RE = re.compile(
    r"(?<![0-9A-Fa-f])([0-9A-Fa-f]{32,})(?![0-9A-Fa-f])"
)


# =========================================================
# CONFIG
# =========================================================

MAX_HEX_LENGTH = 120_000
MIN_PRINTABLE_RATIO = 0.60


# =========================================================
# UTILITIES
# =========================================================

def _printable_ratio(text: str) -> float:
    if not text:
        return 0.0
    printable = sum(1 for c in text if c in string.printable)
    return printable / len(text)


def _is_likely_hash(candidate: str) -> bool:
    """
    Filters common hash-like structures to reduce false positives.
    """
    # SHA1 / SHA256 / MD5-like patterns (heuristic)
    if len(candidate) in (32, 40, 64, 128):
        return True
    return False


# =========================================================
# CORE DECODER
# =========================================================

def decode_hex_candidate(candidate: str) -> str | None:
    token = candidate.strip()

    if not token:
        return None

    if len(token) > MAX_HEX_LENGTH:
        return None

    if len(token) % 2 != 0:
        return None

    # -----------------------------------------------------
    # SKIP HASH-LIKE STRUCTURES (CRITICAL FIX)
    # -----------------------------------------------------
    if _is_likely_hash(token):
        return None

    try:
        decoded_bytes = bytes.fromhex(token)
        decoded = decoded_bytes.decode("utf-8", errors="strict").strip()
    except Exception:
        return None

    if not decoded:
        return None

    # -----------------------------------------------------
    # FILTER LOW-SIGNAL OUTPUTS
    # -----------------------------------------------------
    if _printable_ratio(decoded) < MIN_PRINTABLE_RATIO:
        return None

    return decoded


def is_hex_like(text: str) -> bool:
    """
    Conservative whole-payload hex check.
    Security-sensitive: require enough even-length hex and avoid common hash
    lengths so IDs and checksums do not inflate prompt risk.
    """
    token = re.sub(r"[\s:,-]+", "", str(text or "").strip())
    if len(token) < 24 or len(token) > MAX_HEX_LENGTH:
        return False
    if len(token) % 2 != 0:
        return False
    if _is_likely_hash(token):
        return False
    return bool(re.fullmatch(r"[0-9A-Fa-f]+", token))


def safe_decode_hex(text: str) -> str | None:
    token = re.sub(r"[\s:,-]+", "", str(text or "").strip())
    if not is_hex_like(token):
        return None
    return decode_hex_candidate(token)


# =========================================================
# EXTRACTION ENGINE
# =========================================================

def extract_hex_decodes(content: str) -> List[Tuple[str, str]]:
    decodes: List[Tuple[str, str]] = []

    for match in HEX_CANDIDATE_RE.finditer(content):
        candidate = match.group(1)

        decoded = decode_hex_candidate(candidate)
        if decoded:
            decodes.append((candidate, decoded))

    return decodes
