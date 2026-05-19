from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher


WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(value: str) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value)
    normalized = normalized.replace("\u200b", "").replace("\u200c", "").replace("\u200d", "").replace("\ufeff", "")
    return WHITESPACE_RE.sub(" ", normalized).strip()


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    counter = Counter(value)
    length = len(value)
    entropy = 0.0
    for count in counter.values():
        probability = count / length
        entropy -= probability * math.log2(probability)
    return entropy


def bounded(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def safe_preview(value: str, max_chars: int = 120) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}..."


def similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(a=normalize_text(a).lower(), b=normalize_text(b).lower()).ratio()


def tokenize(value: str) -> set[str]:
    if not value:
        return set()
    return {token for token in re.findall(r"[a-zA-Z0-9_]{2,}", normalize_text(value).lower()) if token}


def jaccard_similarity(a: str, b: str) -> float:
    a_tokens = tokenize(a)
    b_tokens = tokenize(b)
    if not a_tokens and not b_tokens:
        return 1.0
    if not a_tokens or not b_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)
