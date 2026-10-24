"""Run the checked-in synthetic corpus through the real detection paths."""
from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.security.security_enforcement_layer import SecurityEnforcementInput
from app.services.security_service import scan_prompt
from app.services.threat_detection import ThreatDetectionService


DATASET = Path(__file__).resolve().parents[1] / "security_detection_labeled.json"


def _is_malicious(result: dict[str, Any]) -> bool:
    return str(result.get("decision") or "").upper() in {"BLOCK", "SANITIZE"} or str(
        result.get("status") or ""
    ).upper() in {"BLOCKED", "REDACTED"}


def _counts(rows: list[tuple[dict[str, Any], bool]]) -> dict[str, int]:
    return {
        "TP": sum(label == "malicious" and predicted for case, predicted in rows for label in [case["label"]]),
        "FP": sum(label == "benign" and predicted for case, predicted in rows for label in [case["label"]]),
        "TN": sum(label == "benign" and not predicted for case, predicted in rows for label in [case["label"]]),
        "FN": sum(label == "malicious" and not predicted for case, predicted in rows for label in [case["label"]]),
    }


def _metric_line(rows: list[tuple[dict[str, Any], bool]]) -> str:
    c = _counts(rows)
    precision = c["TP"] / (c["TP"] + c["FP"]) if c["TP"] + c["FP"] else None
    recall = c["TP"] / (c["TP"] + c["FN"]) if c["TP"] + c["FN"] else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else None
    )
    show = lambda value: "NA" if value is None else f"{value:.3f}"
    return (
        f"n={len(rows)} TP={c['TP']} FP={c['FP']} TN={c['TN']} FN={c['FN']} "
        f"precision={show(precision)} recall={show(recall)} F1={show(f1)}"
    )


def evaluate() -> None:
    cases = json.loads(DATASET.read_text(encoding="utf-8"))
    service = ThreatDetectionService()
    paths: dict[str, list[tuple[dict[str, Any], bool]]] = {
        "ThreatDetectionService_PRO_AI_disabled": [],
        "scan_prompt_with_pre_model_enforcement": [],
    }
    for case in cases:
        direct = service.analyze(case["prompt"], security_tier="PRO", enable_ai=False)
        direct_result = {"decision": direct.decision}
        paths["ThreatDetectionService_PRO_AI_disabled"].append((case, _is_malicious(direct_result)))

        enforcement_input = SecurityEnforcementInput(
            prompt=case["prompt"],
            session_id=f"dataset-{case['id']}",
            conversation_id=case["id"],
            conversation_history=case.get("conversation_history"),
            untrusted_content=case.get("untrusted_content"),
        )
        scan = scan_prompt(
            case["prompt"],
            security_tier="PRO",
            enable_ai=False,
            enforcement_input=enforcement_input,
        )
        paths["scan_prompt_with_pre_model_enforcement"].append((case, _is_malicious(scan)))
        if case["label"] != ("malicious" if _is_malicious(scan) else "benign"):
            print(f"MISMATCH id={case['id']} label={case['label']} result={scan.get('decision')}/{scan.get('status')}")

    for path, rows in paths.items():
        print(f"PATH {path} overall {_metric_line(rows)}")
        for category in sorted({case["category"] for case, _ in rows}):
            group = [(case, predicted) for case, predicted in rows if case["category"] == category]
            print(f"PATH {path} category={category} {_metric_line(group)}")
        for case, predicted in rows:
            prompt_display = ascii(case["prompt"])[1:-1]
            if case["label"] == "malicious" and not predicted:
                print(f"FALSE_NEGATIVE path={path} id={case['id']} category={case['category']} prompt={prompt_display}")
            if case["label"] == "benign" and predicted:
                print(f"FALSE_POSITIVE path={path} id={case['id']} category={case['category']} prompt={prompt_display}")


if __name__ == "__main__":
    evaluate()
