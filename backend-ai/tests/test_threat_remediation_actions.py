from __future__ import annotations

import asyncio
import copy
import csv
import io
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.services import dashboard_service, threats_service


USER = {"id": "user-1", "organization_name": "workspace-1"}
NOW = datetime(2026, 9, 22, 12, tzinfo=timezone.utc)


def _log(log_id: int, *, status: str = "BLOCKED") -> dict:
    return {
        "id": log_id,
        "workspace_id": "workspace-1",
        "status": status,
        "threat_type": "PROMPT_INJECTION",
        "threat_score": 0.95,
        "timestamp": NOW - timedelta(minutes=5),
    }


def _report(log_id: int | str, actions: list[dict], **overrides) -> dict:
    return {
        "id": f"remediation-{log_id}",
        "workspace_id": "workspace-1",
        "kind": "remediation",
        "security_log_id": log_id,
        "actions_version": 1,
        "actions": actions,
        "created_at": NOW - timedelta(minutes=4),
        **overrides,
    }


@pytest.fixture(autouse=True)
def isolated_store(monkeypatch):
    monkeypatch.setitem(threats_service._fallback_store, "logs", [])
    monkeypatch.setitem(threats_service._fallback_store, "reports", [])
    monkeypatch.setattr(threats_service, "collection_from_request", lambda *_args: None)
    monkeypatch.setattr(dashboard_service, "collection_from_request", lambda *_args: None)
    monkeypatch.setattr(threats_service, "utcnow", lambda: NOW)


def _list_events() -> list[dict]:
    payload = asyncio.run(
        threats_service.list_threat_events(
            None,
            USER,
            severity=None,
            status=None,
            threat_type=None,
            search=None,
            time_range="24h",
            sort_field="ts",
            sort_dir="desc",
            page=1,
            page_size=100,
        )
    )
    return payload["threats"]


@pytest.mark.parametrize("status", ["SUCCESS", "FAILED", "SKIPPED"])
def test_list_detail_and_export_preserve_recorded_email_outcome(status):
    email_action = {"type": "ALERT_EMAIL", "status": status, "details": f"Recorded {status.lower()} reason"}
    threats_service._fallback_store["logs"].append(_log(1))
    threats_service._fallback_store["reports"].append(_report("1", [email_action]))

    event = _list_events()[0]
    detail = asyncio.run(threats_service.get_threat_event(None, USER, threat_id="thr_1"))
    expected = [{"type": "QUARANTINE_REQUEST", "status": "SUCCESS"}, email_action]
    assert event["actions"] == detail["actions"] == expected
    assert event["actionsComplete"] is (status in {"SUCCESS", "SKIPPED"})
    exported = list(csv.DictReader(io.StringIO(threats_service.render_threat_events_csv([event]))))
    assert json.loads(exported[0]["actions"]) == expected


def test_missing_report_does_not_invent_email_delivery():
    threats_service._fallback_store["logs"].extend([_log(1), _log(2, status="REDACTED")])

    events = {event["logId"]: event for event in _list_events()}

    assert events["1"]["actions"] == [{"type": "QUARANTINE_REQUEST", "status": "SUCCESS"}]
    assert events["2"]["actions"] == []
    assert events["2"]["actionsComplete"] is False


def test_historical_alert_successes_are_unverified_without_mutating_evidence():
    historical = _report(1, [
        {"type": "QUARANTINE_REQUEST", "status": "SUCCESS"},
        {"type": "ALERT_EMAIL", "status": "SUCCESS"},
        {"type": "ALERT_WEBHOOK", "status": "SUCCESS"},
    ])
    historical.pop("actions_version")
    original = copy.deepcopy(historical)
    threats_service._fallback_store["logs"].append(_log(1))
    threats_service._fallback_store["reports"].append(historical)

    actions = _list_events()[0]["actions"]

    assert actions[0]["status"] == "SUCCESS"
    assert [action["status"] for action in actions[1:]] == ["UNKNOWN", "UNKNOWN"]
    assert all(action.get("details") for action in actions[1:])
    assert historical == original


def test_remediation_reports_mark_legacy_alerts_unknown_without_rewriting_evidence():
    report = _report(1, [
        {"type": "ALERT_EMAIL", "status": "SUCCESS"},
        {"type": "ALERT_WEBHOOK", "status": "SUCCESS"},
    ])
    report.pop("actions_version")
    original = copy.deepcopy(report)
    dashboard_service._fallback_store["reports"].append(report)

    rows = asyncio.run(dashboard_service.list_remediations(None, USER, limit=50, offset=0))

    assert [action["status"] for action in rows[0]["actions"]] == ["UNKNOWN", "UNKNOWN"]
    assert all(action.get("details") for action in rows[0]["actions"])
    assert report == original


@pytest.mark.parametrize("status", ["SUCCESS", "FAILED", "SKIPPED"])
def test_remediation_reports_preserve_verified_action_outcomes(status):
    action = {"type": "ALERT_EMAIL", "status": status, "details": "Recorded outcome"}
    dashboard_service._fallback_store["reports"].append(_report(1, [action]))

    rows = asyncio.run(dashboard_service.list_remediations(None, USER, limit=50, offset=0))

    assert rows[0]["actions"] == [action]


def test_remediation_join_is_scoped_to_workspace_log_and_kind():
    threats_service._fallback_store["logs"].append(_log(1, status="REDACTED"))
    success = [{"type": "ALERT_EMAIL", "status": "SUCCESS"}]
    threats_service._fallback_store["reports"].extend([
        _report(1, success, workspace_id="another-workspace"),
        _report(2, success),
        _report(1, success, kind="another-report"),
    ])

    assert _list_events()[0]["actions"] == []


def test_mongo_fetch_batches_identifiers_and_includes_fallback_reports(monkeypatch):
    documents = [_log(1), _log(2, status="REDACTED")]
    recorded = {"type": "ALERT_EMAIL", "status": "FAILED", "details": "SMTP rejected the message"}
    fallback = {"type": "ALERT_EMAIL", "status": "SKIPPED", "details": "User disabled email alerts"}
    monkeypatch.setattr(threats_service, "_load_threat_documents", AsyncMock(return_value=documents))
    monkeypatch.setattr(threats_service, "collection_from_request", lambda *_args: object())
    fetch = AsyncMock(return_value=[_report(1, [recorded])])
    monkeypatch.setattr(threats_service, "list_collection_documents", fetch)
    threats_service._fallback_store["reports"].append(_report(2, [fallback]))

    events = {event["logId"]: event for event in _list_events()}

    fetch.assert_awaited_once()
    query = fetch.call_args.kwargs["filter_query"]
    assert query["workspace_id"] == "workspace-1"
    assert query["kind"] == "remediation"
    assert set(query["security_log_id"]["$in"]) == {1, "1", 2, "2"}
    assert events["1"]["actions"][-1] == recorded
    assert events["2"]["actions"] == [fallback]


def test_report_query_failure_uses_available_fallback_evidence(monkeypatch):
    monkeypatch.setattr(threats_service, "_load_threat_documents", AsyncMock(return_value=[_log(1)]))
    monkeypatch.setattr(threats_service, "collection_from_request", lambda *_args: object())
    monkeypatch.setattr(threats_service, "list_collection_documents", AsyncMock(side_effect=RuntimeError("database unavailable")))
    action = {"type": "ALERT_EMAIL", "status": "FAILED", "details": "SMTP unavailable"}
    threats_service._fallback_store["reports"].append(_report(1, [action]))

    assert _list_events()[0]["actions"][-1] == action


def test_resolving_incident_preserves_email_failure(monkeypatch):
    threats_service._fallback_store["logs"].append(_log(1))
    action = {"type": "ALERT_EMAIL", "status": "FAILED", "details": "SMTP unavailable"}
    threats_service._fallback_store["reports"].append(_report(1, [action]))
    monkeypatch.setattr(threats_service, "record_audit_event", AsyncMock())

    event = asyncio.run(threats_service.update_threat_status(None, USER, threat_id="thr_1", status="RESOLVED"))

    assert event["status"] == "RESOLVED"
    assert event["actions"][-1] == action
    assert event["actionsComplete"] is False
    assert any("Incident workflow has been completed" in item["message"] for item in event["executionTrace"])


def test_blocked_statistics_and_sparklines_use_successful_quarantine_actions():
    threats_service._fallback_store["logs"].extend([_log(1), _log(2, status="REDACTED")])
    stats = asyncio.run(threats_service.get_threat_stats(None, USER, time_range="24h"))
    assert stats["blocked"] == 1
    assert sum(stats["sparklines"]["blocked"]) == 1

    outcomes = [
        {"actions": [{"type": "QUARANTINE_REQUEST", "status": status}]}
        for status in ["SUCCESS", "FAILED", "SKIPPED", "UNKNOWN"]
    ]
    assert threats_service._stats_for_events(outcomes)["blocked"] == 1
