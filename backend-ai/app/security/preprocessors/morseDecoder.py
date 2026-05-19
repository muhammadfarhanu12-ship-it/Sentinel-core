from __future__ import annotations

import re
from typing import Optional, Dict, Any
from app.security.utils.text import normalize_text, shannon_entropy


MORSE_MAP = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
    "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
    "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
    ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
    "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
    "--..": "Z",
    "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4",
    ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
}

MORSE_ALLOWED_RE = re.compile(r"^[.\-/\s|]{12,}$")

# 🚨 Injection indicators after decoding
SUSPICIOUS_PATTERNS = [
    "ignore previous instructions",
    "bypass policy",
    "execute",
    "transfer",
    "wire",
    "send money",
    "system prompt",
    "developer mode",
    "override",
]


def looks_like_morse(content: str) -> bool:
    normalized = content.strip()

    if not normalized or len(normalized) < 12:
        return False

    if len(normalized) > 5000:  # 🚨 prevent payload abuse
        return False

    if not MORSE_ALLOWED_RE.match(normalized):
        return False

    tokens = [
        token for token in re.split(r"\s+", normalized.replace("|", " / "))
        if token
    ]

    if not tokens:
        return False

    morse_tokens = sum(1 for token in tokens if token == "/" or token in MORSE_MAP)
    return (morse_tokens / len(tokens)) >= 0.75


def is_morse_like(text: str) -> bool:
    return looks_like_morse(text)


def decode_morse(content: str) -> Dict[str, Any] | None:
    if not looks_like_morse(content):
        return None

    tokens = [
        token for token in re.split(r"\s+", content.strip().replace("|", " / "))
        if token
    ]

    decoded_chars: list[str] = []

    for token in tokens:
        if token == "/":
            decoded_chars.append(" ")
            continue
        decoded_chars.append(MORSE_MAP.get(token, ""))

    decoded = "".join(decoded_chars).strip()
    if not decoded:
        return None

    normalized_decoded = normalize_text(decoded)
    entropy = shannon_entropy(decoded)

    # 🚨 post-decode security scan
    lower_decoded = normalized_decoded.lower()

    suspicious_hits = [
        pattern for pattern in SUSPICIOUS_PATTERNS
        if pattern in lower_decoded
    ]

    confidence = 0.0
    if suspicious_hits:
        confidence += 0.6
    if entropy > 4.2:  # high entropy = possible obfuscation chain
        confidence += 0.3

    return {
        "decoded": normalized_decoded,
        "suspicious": bool(suspicious_hits),
        "suspicious_hits": suspicious_hits,
        "entropy": entropy,
        "confidence": min(confidence, 1.0),
        "safe": confidence < 0.5,
    }


def decode_morse_text(content: str) -> str | None:
    result = decode_morse(content)
    if not result:
        return None
    decoded = str(result.get("decoded") or "").strip()
    return decoded or None
