from __future__ import annotations

import binascii
import html
import logging
import re
import unicodedata
from base64 import b64decode
from time import perf_counter
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote

from app.core.config import settings
from app.security.preprocessors.base64Decoder import extract_base64_decodes, is_base64_like, safe_decode_base64
from app.security.preprocessors.hexDecoder import extract_hex_decodes, is_hex_like, safe_decode_hex
from app.security.preprocessors.morseDecoder import decode_morse, is_morse_like
from app.security.utils.text import normalize_text, shannon_entropy
from app.security.utils.types import DecodeArtifact, DecodeResult

logger = logging.getLogger("security.decode_layer")


# =========================================================
# SAFE CONFIG
# =========================================================

MAX_PAYLOAD_CHARS = max(4000, int(getattr(settings, "SENTINEL_MAX_DECODE_PAYLOAD_CHARS", 24000) or 24000))
ENTROPY_SUSPICIOUS_THRESHOLD = 4.2
ENTROPY_SKIP_THRESHOLD = 6.5  # likely encrypted/garbage payload

INVISIBLE_CODEPOINTS = {
    "\u200b": "ZERO WIDTH SPACE",
    "\u200c": "ZERO WIDTH NON-JOINER",
    "\u200d": "ZERO WIDTH JOINER",
    "\ufeff": "ZERO WIDTH NO-BREAK SPACE",
    "\u2060": "WORD JOINER",
    "\u00ad": "SOFT HYPHEN",
}


def normalize_unicode(text: str) -> str:
    return unicodedata.normalize("NFKC", str(text or ""))


def detect_invisible_chars(text: str) -> list[str]:
    findings: list[str] = []
    for char in str(text or ""):
        category = unicodedata.category(char)
        if char in INVISIBLE_CODEPOINTS or category in {"Cf", "Cc"} and char not in {"\n", "\r", "\t"}:
            name = INVISIBLE_CODEPOINTS.get(char) or unicodedata.name(char, f"U+{ord(char):04X}")
            marker = f"U+{ord(char):04X}:{name}"
            if marker not in findings:
                findings.append(marker)
    return findings


def reveal_invisible_chars(text: str) -> tuple[str, list[str]]:
    signals = detect_invisible_chars(text)
    revealed: list[str] = []
    for char in str(text or ""):
        if detect_invisible_chars(char):
            revealed.append(f"[U+{ord(char):04X}]")
        else:
            revealed.append(char)
    return "".join(revealed), signals


def decode_html_entities(text: str) -> str:
    return html.unescape(str(text or ""))


def decode_url_encoding(text: str) -> str:
    return unquote(str(text or ""))


def _is_readable_text(text: str) -> bool:
    value = str(text or "")
    if not value:
        return False
    printable = sum(1 for char in value if char.isprintable() or char in "\r\n\t")
    alpha_space = sum(1 for char in value if char.isalnum() or char.isspace() or char in ".,:;!?@#$%&*()[]{}<>/_+-='\"`")
    return printable / max(len(value), 1) >= 0.75 and alpha_space / max(len(value), 1) >= 0.65


def _add_variant(variants: list[dict], seen: set[str], text: str, source: str, confidence: float) -> bool:
    candidate = str(text or "").strip()
    if not candidate or len(candidate) > MAX_PAYLOAD_CHARS:
        candidate = candidate[:MAX_PAYLOAD_CHARS].strip()
    key = re.sub(r"\s+", " ", normalize_unicode(candidate)).strip().lower()
    if not candidate or key in seen:
        return False
    seen.add(key)
    variants.append({"text": candidate, "source": source, "confidence": round(float(confidence), 4)})
    return True


def generate_decoded_variants(text: str, max_depth: int = 2) -> dict:
    """
    Build audit-friendly decoded variants for indirect prompt-injection scanning.
    Security-sensitive: bounded breadth/depth and readability gates prevent
    recursive decoding abuse while still surfacing hidden instructions.
    """
    original = str(text or "")
    signals: list[str] = []
    variants: list[dict] = []
    seen: set[str] = set()
    max_depth = max(1, min(int(max_depth or 2), 4))

    _add_variant(variants, seen, original, "original", 1.0)

    invisible = detect_invisible_chars(original)
    if invisible:
        signals.append("zero_width_chars_detected")
        revealed, _ = reveal_invisible_chars(original)
        _add_variant(variants, seen, revealed, "invisible_revealed", 0.82)

    frontier: list[tuple[str, str, int]] = [(original, "original", 0)]
    while frontier:
        current, source, depth = frontier.pop(0)
        if depth >= max_depth:
            continue

        transformations: list[tuple[str, str, float, str | None]] = [
            ("unicode_nfkc", normalize_unicode(current), 0.90, None),
            ("html_entity", decode_html_entities(current), 0.88, None),
            ("url", decode_url_encoding(current), 0.88, "url_encoded_payload_detected"),
            ("whitespace_normalized", normalize_text(current), 0.86, None),
        ]

        if is_base64_like(current):
            signals.append("base64_like_payload_detected")
            decoded = safe_decode_base64(current)
            if decoded and _is_readable_text(decoded):
                transformations.append(("base64", decoded, 0.86, "base64_payload_decoded"))

        if is_hex_like(current):
            signals.append("hex_like_payload_detected")
            decoded = safe_decode_hex(current)
            if decoded and _is_readable_text(decoded):
                transformations.append(("hex", decoded, 0.84, "hex_payload_decoded"))

        if is_morse_like(current):
            signals.append("morse_like_payload_detected")
            morse = decode_morse(current)
            decoded = str((morse or {}).get("decoded") or "").strip()
            if decoded and _is_readable_text(decoded):
                transformations.append(("morse", decoded, float((morse or {}).get("confidence") or 0.85) or 0.85, "morse_payload_detected"))

        for next_source, next_text, confidence, signal in transformations:
            if next_text == current:
                continue
            combined_source = next_source if source == "original" else f"{source}>{next_source}"
            if signal and signal not in signals:
                signals.append(signal)
            if _add_variant(variants, seen, next_text, combined_source, confidence):
                frontier.append((next_text, combined_source, depth + 1))

        # Decode embedded fragments without replacing the legacy process() path.
        for original_fragment, decoded_fragment in extract_base64_decodes(current):
            if _is_readable_text(decoded_fragment):
                if "base64_like_payload_detected" not in signals:
                    signals.append("base64_like_payload_detected")
                _add_variant(variants, seen, decoded_fragment, f"{source}>base64_fragment", 0.82)
        for original_fragment, decoded_fragment in extract_hex_decodes(current):
            if _is_readable_text(decoded_fragment):
                if "hex_like_payload_detected" not in signals:
                    signals.append("hex_like_payload_detected")
                _add_variant(variants, seen, decoded_fragment, f"{source}>hex_fragment", 0.80)

    return {"original": original, "variants": variants, "signals": sorted(set(signals))}


# =========================================================
# CORE ENGINE
# =========================================================

class DecodeLayer:

    def __init__(self) -> None:
        self.enabled: bool = bool(getattr(settings, "SENTINEL_ENABLE_DECODER", True))
        self.max_depth: int = max(1, int(getattr(settings, "SENTINEL_MAX_DECODE_DEPTH", 3)))
        self.timeout_ms: int = max(50, int(getattr(settings, "SENTINEL_DECODE_TIMEOUT_MS", 400)))

    # -----------------------------------------------------
    # ENTROPY FILTER (NEW)
    # -----------------------------------------------------

    def _entropy_gate(self, text: str) -> bool:
        entropy = shannon_entropy(text)

        # skip likely encrypted blobs
        if entropy >= ENTROPY_SKIP_THRESHOLD:
            return False

        return True

    # -----------------------------------------------------
    # SAFE BASE64
    # -----------------------------------------------------

    def _safe_decode_base64(self, value: str) -> Optional[str]:
        token = value.strip()

        if len(token) > MAX_PAYLOAD_CHARS:
            return None

        try:
            decoded = b64decode(token, validate=True).decode("utf-8", errors="strict").strip()
            if not decoded:
                return None
            return decoded
        except Exception:
            return None

    # -----------------------------------------------------
    # SAFE HEX
    # -----------------------------------------------------

    def _safe_decode_hex(self, value: str) -> Optional[str]:
        token = value.strip()

        if len(token) > MAX_PAYLOAD_CHARS:
            return None

        try:
            decoded = bytes.fromhex(token).decode("utf-8", errors="ignore").strip()
            if not decoded:
                return None
            return decoded
        except Exception:
            return None

    # -----------------------------------------------------
    # MAIN PIPELINE
    # -----------------------------------------------------

    def process(self, content: str) -> DecodeResult:

        if not self.enabled:
            return DecodeResult(content=content or "")

        original_content = str(content or "")
        truncated = len(original_content) > MAX_PAYLOAD_CHARS
        raw = original_content[:MAX_PAYLOAD_CHARS]

        start = perf_counter()

        artifacts: List[DecodeArtifact] = []
        working = raw
        timed_out = False

        morse_result = decode_morse(working)
        if morse_result and morse_result.get("decoded"):
            decoded_text = str(morse_result.get("decoded") or "")
            artifacts.append(
                DecodeArtifact(
                    encoding="morse",
                    original_fragment=working[:220],
                    decoded_fragment=decoded_text[:220],
                    depth=0,
                    entropy_before=round(shannon_entropy(working), 4),
                    entropy_after=round(shannon_entropy(decoded_text), 4),
                    suspicious=bool(morse_result.get("suspicious")),
                )
            )
            working = decoded_text

        # =================================================
        # ATTACK GRAPH (NEW)
        # =================================================
        decode_chain: List[Dict[str, str]] = []

        for depth in range(self.max_depth):

            if (perf_counter() - start) * 1000 > self.timeout_ms:
                timed_out = True
                break

            original_snapshot = working

            entropy = shannon_entropy(working)

            # skip high-entropy garbage early
            if entropy >= ENTROPY_SKIP_THRESHOLD:
                break

            # -------------------------------------------------
            # URL decode
            # -------------------------------------------------
            url_decoded = unquote(working)
            if url_decoded != working:
                before = working
                working = url_decoded
                artifacts.append(
                    DecodeArtifact(
                        encoding="url",
                        original_fragment=before[:220],
                        decoded_fragment=working[:220],
                        depth=depth + 1,
                        entropy_before=round(shannon_entropy(before), 4),
                        entropy_after=round(shannon_entropy(working), 4),
                        suspicious=bool(shannon_entropy(working) >= ENTROPY_SUSPICIOUS_THRESHOLD),
                    )
                )

                decode_chain.append({
                    "type": "url",
                    "depth": str(depth),
                })

            # -------------------------------------------------
            # Base64 decode
            # -------------------------------------------------
            b64 = self._safe_decode_base64(working)
            if b64:
                before = working
                working = b64
                artifacts.append(
                    DecodeArtifact(
                        encoding="base64",
                        original_fragment=before[:220],
                        decoded_fragment=working[:220],
                        depth=depth + 1,
                        entropy_before=round(shannon_entropy(before), 4),
                        entropy_after=round(shannon_entropy(working), 4),
                        suspicious=bool(shannon_entropy(working) >= ENTROPY_SUSPICIOUS_THRESHOLD),
                    )
                )

                decode_chain.append({
                    "type": "base64",
                    "depth": str(depth),
                })

            # -------------------------------------------------
            # Hex decode
            # -------------------------------------------------
            hx = self._safe_decode_hex(working)
            if hx:
                before = working
                working = hx
                artifacts.append(
                    DecodeArtifact(
                        encoding="hex",
                        original_fragment=before[:220],
                        decoded_fragment=working[:220],
                        depth=depth + 1,
                        entropy_before=round(shannon_entropy(before), 4),
                        entropy_after=round(shannon_entropy(working), 4),
                        suspicious=bool(shannon_entropy(working) >= ENTROPY_SUSPICIOUS_THRESHOLD),
                    )
                )

                decode_chain.append({
                    "type": "hex",
                    "depth": str(depth),
                })

            # -------------------------------------------------
            # Fragment decodes (existing logic preserved)
            # -------------------------------------------------
            for original, decoded in extract_base64_decodes(working):
                working = working.replace(original, decoded)
                artifacts.append(
                    DecodeArtifact(
                        encoding="base64_fragment",
                        original_fragment=original[:220],
                        decoded_fragment=decoded[:220],
                        depth=depth + 1,
                        entropy_before=round(shannon_entropy(original), 4),
                        entropy_after=round(shannon_entropy(decoded), 4),
                        suspicious=bool(shannon_entropy(decoded) >= ENTROPY_SUSPICIOUS_THRESHOLD),
                    )
                )

            for original, decoded in extract_hex_decodes(working):
                working = working.replace(original, decoded)
                artifacts.append(
                    DecodeArtifact(
                        encoding="hex_fragment",
                        original_fragment=original[:220],
                        decoded_fragment=decoded[:220],
                        depth=depth + 1,
                        entropy_before=round(shannon_entropy(original), 4),
                        entropy_after=round(shannon_entropy(decoded), 4),
                        suspicious=bool(shannon_entropy(decoded) >= ENTROPY_SUSPICIOUS_THRESHOLD),
                    )
                )

            working = normalize_text(working)

            # no change → stop
            if working == original_snapshot:
                break

        # =================================================
        # FINAL RETURN
        # =================================================

        return DecodeResult(
            content=working,
            artifacts=artifacts,
            max_depth_reached=len(decode_chain),
            timed_out=timed_out,
            truncated=truncated,
        )

    # convenience
    def decode_text(self, content: str) -> str:
        return self.process(content).content


decode_layer = DecodeLayer()
