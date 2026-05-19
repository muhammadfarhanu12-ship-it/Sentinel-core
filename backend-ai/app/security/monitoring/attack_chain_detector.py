from __future__ import annotations
from collections import deque

class AttackChainDetector:
    def __init__(self):
        self.history = deque(maxlen=10)

    def add(self, text: str):
        self.history.append(text.lower())

    def detect_chain_attack(self) -> bool:
        signals = 0

        for msg in self.history:
            if "imagine" in msg:
                signals += 1
            if "ignore previous" in msg:
                signals += 2
            if "execute" in msg:
                signals += 2
            if "transfer" in msg:
                signals += 2

        return signals >= 5