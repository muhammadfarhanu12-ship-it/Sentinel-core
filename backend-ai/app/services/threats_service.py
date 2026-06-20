from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, Request

from app.security.redaction_engine import redact_sensitive_data
from app.services.dashboard_service import (
    _fallback_store,
    collection_from_request,
    ensure_datetime,
    list_collection_documents,
    matches_identifier,
    normalize_log_status,
    normalize_score_100,
    normalize_upper_token,
    parse_optional_int,
    public_document,
    record_audit_event,
    utcnow,
    workspace_id_for,
)

THREAT_TYPES = {
    "DATA_EXFILTRATION",
    "PROMPT_INJECTION",
    "DATA_LEAK",
    "ENCODING_OBFUSCATION",
    "AML_VIOLATION",
    "CREDENTIAL_THEFT",
}
THREAT_TYPE_ALIASES = {
    "PII": "DATA_LEAK",
    "PII_EXPOSURE": "DATA_LEAK",
    "OUTPUT_LEAK": "DATA_LEAK",
    "LEAK": "DATA_LEAK",
    "JAILBREAK": "PROMPT_INJECTION",
    "POLICY_BYPASS": "PROMPT_INJECTION",
    "INDIRECT_INJECTION": "PROMPT_INJECTION",
    "BASE64_OBFUSCATION": "ENCODING_OBFUSCATION",
    "HEX_OBFUSCATION": "ENCODING_OBFUSCATION",
    "MORSE_OBFUSCATION": "ENCODING_OBFUSCATION",
    "FINANCIAL_RISK": "AML_VIOLATION",
    "FINANCIAL_ACTION": "AML_VIOLATION",
    "SECRET_EXFILTRATION": "DATA_EXFILTRATION",
    "API_KEY_THEFT": "CREDENTIAL_THEFT",
}
SEVERITY_VALUES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
THREAT_STATUS_VALUES = {"NEW", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"}
UPDATE_STATUS_VALUES = {"INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"}
SORT_FIELDS = {"id", "score", "ts"}
TIME_RANGES = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}


def _time_delta(time_range: str | None) -> timedelta:
    return TIME_RANGES.get(str(time_range or "24h").strip(), TIME_RANGES["24h"])


def _period_bounds(time_range: str | None) -> tuple[datetime, datetime]:
    end = utcnow()
    return end - _time_delta(time_range), end


def _bucket_labels(start: datetime, end: datetime, *, bucket_count: int) -> list[datetime]:
    bucket_count = max(bucket_count, 1)
    span_seconds = max((end - start).total_seconds(), 1)
    step = timedelta(seconds=span_seconds / bucket_count)
    return [start + (step * index) for index in range(bucket_count)]


def _bucket_index(timestamp: datetime, start: datetime, end: datetime, bucket_count: int) -> int:
    if timestamp <= start:
        return 0
    if timestamp >= end:
        return bucket_count - 1
    span_seconds = max((end - start).total_seconds(), 1)
    position = (timestamp - start).total_seconds() / span_seconds
    return min(max(int(position * bucket_count), 0), bucket_count - 1)


def _field_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _extract_policy_names(*sources: Any) -> list[str]:
    names: list[str] = []
    for source in sources:
        for item in _field_list(source):
            if isinstance(item, dict):
                candidate = str(item.get("policy_name") or item.get("name") or item.get("id") or "").strip()
            else:
                candidate = str(item or "").strip()
            if candidate:
                names.append(candidate[:120])
    return sorted(dict.fromkeys(names))


def _extract_prompt_preview(document: dict[str, Any]) -> str:
    raw_payload = document.get("raw_payload") if isinstance(document.get("raw_payload"), dict) else {}
    security_metadata = document.get("security_metadata") if isinstance(document.get("security_metadata"), dict) else {}
    candidates = [
        raw_payload.get("prompt_preview"),
        raw_payload.get("prompt"),
        document.get("prompt_preview"),
        security_metadata.get("prompt_preview"),
        document.get("sanitized_content"),
    ]
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return redact_sensitive_data(text[:500])
    return ""


def _normalize_threat_type(document: dict[str, Any]) -> str:
    candidates: list[str] = []
    candidates.extend(str(item or "") for item in _field_list(document.get("threat_types")))
    candidates.append(str(document.get("threat_type") or ""))
    security_enforcement = document.get("security_enforcement") if isinstance(document.get("security_enforcement"), dict) else {}
    candidates.extend(str(item.get("label") or "") for item in _field_list(security_enforcement.get("detections")) if isinstance(item, dict))
    candidates.append(str(document.get("attack_signature") or ""))

    for candidate in candidates:
        normalized = normalize_upper_token(candidate)
        if not normalized or normalized in {"NONE", "NO_THREAT", "CLEAN"}:
            continue
        normalized = THREAT_TYPE_ALIASES.get(normalized, normalized)
        if normalized in THREAT_TYPES:
            return normalized
    return "PROMPT_INJECTION"


def _has_threat_marker(document: dict[str, Any]) -> bool:
    status = normalize_log_status(document.get("status"))
    if status in {"BLOCKED", "REDACTED"}:
        return True
    if bool(document.get("is_quarantined")):
        return True
    raw_types = [str(document.get("threat_type") or ""), *[str(item or "") for item in _field_list(document.get("threat_types"))]]
    if any(normalize_upper_token(item) not in {"", "NONE", "NO_THREAT", "CLEAN"} for item in raw_types):
        return True
    return normalize_score_100(document.get("risk_score"), document.get("threat_score")) >= 40


def _severity_from_score(score: float) -> str:
    if score >= 90:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _normalize_severity(document: dict[str, Any], score: float) -> str:
    severity = normalize_upper_token(document.get("severity"))
    if severity in SEVERITY_VALUES:
        return severity
    if normalize_log_status(document.get("status")) == "BLOCKED" and score >= 70:
        return "CRITICAL" if score >= 90 else "HIGH"
    return _severity_from_score(score)


def _normalize_workflow_status(document: dict[str, Any]) -> str:
    status = normalize_upper_token(
        document.get("threat_workflow_status")
        or document.get("incident_status")
        or document.get("threat_status")
    )
    if status in THREAT_STATUS_VALUES:
        return status
    return "NEW"


def _log_public_id(document: dict[str, Any]) -> str:
    value = document.get("id")
    if value is None:
        value = document.get("_id")
    return str(value)


def _threat_id_for_log_id(log_id: str) -> str:
    raw = str(log_id).strip()
    return raw if raw.startswith("thr_") else f"thr_{raw}"


def _log_id_from_threat_id(threat_id: str) -> str:
    raw = str(threat_id or "").strip()
    return raw[4:] if raw.startswith("thr_") else raw


def _actions_for(document: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    if normalize_log_status(document.get("status")) == "BLOCKED" or bool(document.get("is_quarantined")):
        actions.append("QUARANTINE_REQUEST")
    actions.append("ALERT_EMAIL")
    return list(dict.fromkeys(actions))


def _execution_trace_for(document: dict[str, Any], event: dict[str, Any]) -> list[dict[str, str]]:
    timestamp = event["ts"]
    trace = [
        {
            "time": timestamp,
            "level": "info",
            "message": f"Threat event {event['logId']} captured from {event['provider']}/{event['model']}.",
        }
    ]

    if event["policies"]:
        trace.append(
            {
                "time": timestamp,
                "level": "warn" if event["severity"] in {"CRITICAL", "HIGH"} else "info",
                "message": f"Matched policies: {', '.join(event['policies'][:4])}.",
            }
        )
    else:
        trace.append(
            {
                "time": timestamp,
                "level": "info",
                "message": "No named policy was attached to this event.",
            }
        )

    source_status = normalize_log_status(document.get("status"))
    if source_status == "BLOCKED":
        trace.append({"time": timestamp, "level": "error", "message": "Gateway blocked the request before model execution."})
    elif source_status == "REDACTED":
        trace.append({"time": timestamp, "level": "warn", "message": "Sensitive content was redacted before delivery."})

    if event["actionsComplete"]:
        trace.append({"time": timestamp, "level": "ok", "message": "Incident workflow has been completed."})
    return trace


def _to_threat_event(document: dict[str, Any], *, include_detail: bool = False) -> dict[str, Any]:
    log_id = _log_public_id(document)
    timestamp = ensure_datetime(document.get("timestamp") or document.get("created_at"))
    score = normalize_score_100(document.get("risk_score"), document.get("threat_score"))
    status = _normalize_workflow_status(document)
    security_enforcement = document.get("security_enforcement") if isinstance(document.get("security_enforcement"), dict) else {}
    policies = _extract_policy_names(
        document.get("policy_matches"),
        document.get("matched_policies"),
        security_enforcement.get("policy_matches"),
    )
    event = {
        "id": _threat_id_for_log_id(log_id),
        "logId": log_id,
        "type": _normalize_threat_type(document),
        "severity": _normalize_severity(document, score),
        "score": round(score, 2),
        "status": status,
        "ts": timestamp.isoformat(),
        "apiKey": str(document.get("api_key_id")) if document.get("api_key_id") is not None else None,
        "provider": str(document.get("provider") or document.get("ai_provider") or "unknown"),
        "model": str(document.get("model") or "unknown"),
        "latency": f"{int(document.get('latency_ms') or 0)}ms",
        "policies": policies,
        "actions": _actions_for(document),
        "actionsComplete": status in {"RESOLVED", "FALSE_POSITIVE"},
        "prompt": _extract_prompt_preview(document),
    }
    if include_detail:
        event["executionTrace"] = _execution_trace_for(document, event)
    return event


async def _load_threat_documents(request: Request, current_user: dict[str, Any], *, max_items: int = 5_000) -> list[dict[str, Any]]:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "logs")
    if collection is not None:
        threat_query = {
            "workspace_id": workspace_id,
            "$or": [
                {"status": {"$in": ["BLOCKED", "REDACTED"]}},
                {"is_quarantined": True},
                {"threat_type": {"$exists": True, "$nin": [None, "", "NONE", "NO_THREAT", "CLEAN"]}},
                {"risk_score": {"$gte": 40}},
                {"threat_score": {"$gte": 0.4}},
            ],
        }
        try:
            return await list_collection_documents(
                request,
                collection_name="logs",
                filter_query=threat_query,
                sort=[("timestamp", -1), ("id", -1)],
                limit=max_items,
            )
        except Exception:
            pass

    documents = [
        item
        for item in _fallback_store["logs"]
        if item.get("workspace_id") == workspace_id and _has_threat_marker(item)
    ]
    documents.sort(key=lambda item: ensure_datetime(item.get("timestamp") or item.get("created_at")), reverse=True)
    return documents[:max_items]


def _filter_events(
    events: list[dict[str, Any]],
    *,
    severity: str | None = None,
    status: str | None = None,
    threat_type: str | None = None,
    search: str | None = None,
    time_range: str | None = None,
) -> list[dict[str, Any]]:
    start, end = _period_bounds(time_range)
    severity_filter = normalize_upper_token(severity)
    status_filter = normalize_upper_token(status)
    type_filter = normalize_upper_token(threat_type)
    query = str(search or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for event in events:
        timestamp = ensure_datetime(event.get("ts"))
        if timestamp < start or timestamp > end:
            continue
        if severity_filter and severity_filter != "ALL" and event.get("severity") != severity_filter:
            continue
        if status_filter and status_filter != "ALL" and event.get("status") != status_filter:
            continue
        if type_filter and type_filter != "ALL" and event.get("type") != type_filter:
            continue
        if query:
            haystack = " ".join(
                [
                    str(event.get("id") or ""),
                    str(event.get("logId") or ""),
                    str(event.get("type") or ""),
                    str(event.get("severity") or ""),
                    str(event.get("status") or ""),
                    str(event.get("apiKey") or ""),
                    str(event.get("provider") or ""),
                    str(event.get("model") or ""),
                    " ".join(event.get("policies") or []),
                    str(event.get("prompt") or ""),
                ]
            ).lower()
            if query not in haystack:
                continue
        filtered.append(event)
    return filtered


def _sort_events(events: list[dict[str, Any]], *, sort_field: str | None, sort_dir: str | None) -> list[dict[str, Any]]:
    field = sort_field if sort_field in SORT_FIELDS else "ts"
    reverse = str(sort_dir or "desc").lower() != "asc"

    def key(event: dict[str, Any]) -> Any:
        if field == "score":
            return float(event.get("score") or 0)
        if field == "id":
            return str(event.get("id") or "")
        return ensure_datetime(event.get("ts"))

    return sorted(events, key=key, reverse=reverse)


async def list_threat_events(
    request: Request,
    current_user: dict[str, Any],
    *,
    severity: str | None,
    status: str | None,
    threat_type: str | None,
    search: str | None,
    time_range: str | None,
    sort_field: str | None,
    sort_dir: str | None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    documents = await _load_threat_documents(request, current_user)
    events = [_to_threat_event(document) for document in documents if _has_threat_marker(document)]
    filtered = _filter_events(
        events,
        severity=severity,
        status=status,
        threat_type=threat_type,
        search=search,
        time_range=time_range,
    )
    sorted_events = _sort_events(filtered, sort_field=sort_field, sort_dir=sort_dir)
    resolved_page = max(page, 1)
    resolved_page_size = max(min(page_size, 5_000), 1)
    start = (resolved_page - 1) * resolved_page_size
    return {
        "threats": sorted_events[start : start + resolved_page_size],
        "total": len(sorted_events),
        "page": resolved_page,
        "pageSize": resolved_page_size,
    }


def _stats_for_events(events: list[dict[str, Any]]) -> dict[str, float]:
    total = len(events)
    return {
        "totalThreats": total,
        "blocked": sum(1 for event in events if "QUARANTINE_REQUEST" in (event.get("actions") or [])),
        "critical": sum(1 for event in events if event.get("severity") == "CRITICAL"),
        "highSeverity": sum(1 for event in events if event.get("severity") == "HIGH"),
        "avgRiskScore": round(sum(float(event.get("score") or 0) for event in events) / total, 2) if total else 0,
        "resolved": sum(1 for event in events if event.get("status") == "RESOLVED"),
    }


async def get_threat_stats(request: Request, current_user: dict[str, Any], *, time_range: str | None) -> dict[str, Any]:
    documents = await _load_threat_documents(request, current_user)
    events = [_to_threat_event(document) for document in documents if _has_threat_marker(document)]
    current_start, current_end = _period_bounds(time_range)
    previous_start = current_start - _time_delta(time_range)
    current_events = [
        event for event in events if current_start <= ensure_datetime(event.get("ts")) <= current_end
    ]
    previous_events = [
        event for event in events if previous_start <= ensure_datetime(event.get("ts")) < current_start
    ]
    current = _stats_for_events(current_events)
    previous = _stats_for_events(previous_events)
    deltas = {key: round(float(current[key]) - float(previous.get(key, 0)), 2) for key in current.keys()}

    bucket_count = 12
    bucket_scores: dict[int, list[float]] = defaultdict(list)
    sparklines: dict[str, list[int]] = {
        "totalThreats": [0] * bucket_count,
        "blocked": [0] * bucket_count,
        "critical": [0] * bucket_count,
        "highSeverity": [0] * bucket_count,
        "avgRiskScore": [0] * bucket_count,
        "resolved": [0] * bucket_count,
    }
    for event in current_events:
        index = _bucket_index(ensure_datetime(event.get("ts")), current_start, current_end, bucket_count)
        sparklines["totalThreats"][index] += 1
        if "QUARANTINE_REQUEST" in (event.get("actions") or []):
            sparklines["blocked"][index] += 1
        if event.get("severity") == "CRITICAL":
            sparklines["critical"][index] += 1
        if event.get("severity") == "HIGH":
            sparklines["highSeverity"][index] += 1
        if event.get("status") == "RESOLVED":
            sparklines["resolved"][index] += 1
        bucket_scores[index].append(float(event.get("score") or 0))
    for index, scores in bucket_scores.items():
        sparklines["avgRiskScore"][index] = round(sum(scores) / max(len(scores), 1))

    active_critical = [
        str(event["id"])
        for event in current_events
        if event.get("status") == "NEW" and event.get("severity") == "CRITICAL"
    ]
    return {
        **current,
        "deltas": deltas,
        "sparklines": sparklines,
        "activeCritical": len(active_critical),
        "activeCriticalIds": active_critical,
    }


async def get_threat_trend(
    request: Request,
    current_user: dict[str, Any],
    *,
    time_range: str | None,
    group_by: str | None,
) -> dict[str, Any]:
    _ = group_by
    resolved_range = time_range if time_range in {"7d", "30d", "90d"} else "7d"
    days_by_range = {"7d": 7, "30d": 30, "90d": 90}
    end = utcnow()
    start = end - timedelta(days=days_by_range[resolved_range] - 1)
    documents = await _load_threat_documents(request, current_user)
    events = [_to_threat_event(document) for document in documents if _has_threat_marker(document)]
    days = days_by_range[resolved_range]
    labels = [(start.date() + timedelta(days=index)).isoformat() for index in range(days)]
    label_index = {label: index for index, label in enumerate(labels)}
    series = {threat_type: [0] * len(labels) for threat_type in sorted(THREAT_TYPES)}
    for event in events:
        timestamp = ensure_datetime(event.get("ts"))
        if timestamp < start or timestamp > end:
            continue
        key = timestamp.date().isoformat()
        index = label_index.get(key)
        if index is not None:
            series[str(event.get("type") or "PROMPT_INJECTION")][index] += 1
    return {"labels": labels, "series": series}


async def get_threat_distribution(request: Request, current_user: dict[str, Any], *, time_range: str | None = None) -> list[dict[str, Any]]:
    start, end = _period_bounds(time_range or "30d")
    documents = await _load_threat_documents(request, current_user)
    counter: Counter[str] = Counter()
    for document in documents:
        if not _has_threat_marker(document):
            continue
        event = _to_threat_event(document)
        timestamp = ensure_datetime(event.get("ts"))
        if timestamp < start or timestamp > end:
            continue
        counter[str(event.get("type") or "PROMPT_INJECTION")] += 1
    return [{"type": threat_type, "count": int(counter.get(threat_type, 0))} for threat_type in sorted(THREAT_TYPES)]


def _mongo_id_query(workspace_id: str, log_id: str) -> dict[str, Any]:
    candidates: list[Any] = [log_id]
    parsed = parse_optional_int(log_id)
    if parsed is not None:
        candidates.append(parsed)
    clauses: list[dict[str, Any]] = [{"id": {"$in": list(dict.fromkeys(candidates))}}]
    if ObjectId.is_valid(log_id):
        clauses.append({"_id": ObjectId(log_id)})
    return {"workspace_id": workspace_id, "$or": clauses}


def _fallback_log_matches(document: dict[str, Any], log_id: str) -> bool:
    return matches_identifier(document.get("id"), log_id) or str(document.get("_id") or "") == log_id


async def _find_threat_document(request: Request, current_user: dict[str, Any], threat_id: str) -> dict[str, Any]:
    workspace_id = workspace_id_for(current_user)
    log_id = _log_id_from_threat_id(threat_id)
    collection = collection_from_request(request, "logs")
    if collection is not None:
        document = await collection.find_one(_mongo_id_query(workspace_id, log_id))
        if document is not None and _has_threat_marker(document):
            return document

    for document in _fallback_store["logs"]:
        if document.get("workspace_id") == workspace_id and _fallback_log_matches(document, log_id) and _has_threat_marker(document):
            return document
    raise HTTPException(status_code=404, detail="Threat event not found.")


async def get_threat_event(request: Request, current_user: dict[str, Any], *, threat_id: str) -> dict[str, Any]:
    document = await _find_threat_document(request, current_user, threat_id)
    return _to_threat_event(public_document(document), include_detail=True)


async def update_threat_status(
    request: Request,
    current_user: dict[str, Any],
    *,
    threat_id: str,
    status: str,
) -> dict[str, Any]:
    next_status = normalize_upper_token(status)
    if next_status not in UPDATE_STATUS_VALUES:
        raise HTTPException(status_code=422, detail="Unsupported threat status.")

    workspace_id = workspace_id_for(current_user)
    log_id = _log_id_from_threat_id(threat_id)
    patch = {"threat_workflow_status": next_status, "updated_at": utcnow()}
    collection = collection_from_request(request, "logs")
    document: dict[str, Any] | None = None

    if collection is not None:
        document = await collection.find_one(_mongo_id_query(workspace_id, log_id))
        if document is not None and _has_threat_marker(document):
            await collection.update_one({"_id": document["_id"]}, {"$set": patch})
            document.update(patch)

    if document is None:
        for item in _fallback_store["logs"]:
            if item.get("workspace_id") == workspace_id and _fallback_log_matches(item, log_id) and _has_threat_marker(item):
                item.update(patch)
                document = item
                break

    if document is None:
        raise HTTPException(status_code=404, detail="Threat event not found.")

    await record_audit_event(
        request,
        current_user=current_user,
        action="THREAT_STATUS_UPDATED",
        resource="threat",
        severity="INFO",
        new_value={"threat_id": _threat_id_for_log_id(log_id), "status": next_status},
    )
    return _to_threat_event(public_document(document), include_detail=True)


async def bulk_update_threats(
    request: Request,
    current_user: dict[str, Any],
    *,
    ids: list[str],
    action: str,
) -> dict[str, Any]:
    normalized_action = str(action or "").strip().lower()
    if normalized_action not in {"acknowledge", "resolve"}:
        raise HTTPException(status_code=422, detail="Unsupported bulk threat action.")

    next_status = "INVESTIGATING" if normalized_action == "acknowledge" else "RESOLVED"
    target_ids = [str(item) for item in ids if str(item or "").strip()]
    if not target_ids and normalized_action == "acknowledge":
        stats = await get_threat_stats(request, current_user, time_range="24h")
        target_ids = [str(item) for item in stats.get("activeCriticalIds") or []]

    updated = 0
    for threat_id in target_ids:
        try:
            await update_threat_status(request, current_user, threat_id=threat_id, status=next_status)
            updated += 1
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
    return {"updated": updated}


def render_threat_events_csv(events: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=[
            "id",
            "logId",
            "type",
            "severity",
            "score",
            "status",
            "ts",
            "apiKey",
            "provider",
            "model",
            "latency",
            "policies",
            "actions",
            "actionsComplete",
            "prompt",
        ],
    )
    writer.writeheader()
    for event in events:
        writer.writerow(
            {
                **{key: event.get(key) for key in writer.fieldnames or []},
                "policies": json.dumps(event.get("policies") or []),
                "actions": json.dumps(event.get("actions") or []),
            }
        )
    return buffer.getvalue()
