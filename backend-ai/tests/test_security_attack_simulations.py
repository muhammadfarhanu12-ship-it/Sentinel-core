from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.security_service import scan_prompt


def _load_payloads() -> list[dict[str, str]]:
    pack_path = Path(__file__).resolve().parents[1] / "app" / "security" / "tests" / "attack_simulation_pack.json"
    return json.loads(pack_path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("payload", _load_payloads(), ids=lambda row: str(row.get("name")))
def test_attack_simulation_pack(payload: dict[str, str]):
    result = scan_prompt(str(payload["prompt"]), provider="openai", model="gpt-5.4", security_tier="PRO")
    assert result["status"] in {"CLEAN", "REDACTED", "BLOCKED"}
    expected = str(payload["expected_status"]).upper()
    if expected == "BLOCKED":
        assert result["status"] == "BLOCKED"
    elif expected == "REDACTED":
        assert result["status"] in {"REDACTED", "BLOCKED"}
    else:
        assert result["status"] in {"CLEAN", "REDACTED"}
