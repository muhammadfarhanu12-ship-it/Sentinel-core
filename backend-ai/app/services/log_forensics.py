from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime

from app.models.security_log import SecurityLog
from app.services.enterprise_prompts import build_log_forensic_prompt


def summarize_logs_for_forensics(logs: list[SecurityLog], *, max_entities: int = 25) -> str:
    """
    Summarize logs into a compact forensic view suitable for LLM analysis.

    This intentionally avoids sending raw log payloads and is safe for large datasets:
    - aggregates by IP/status/threat type
    - includes time range + high-signal samples only
    """
    if not logs:
        return "No logs available for the requested window."

    timestamps = [log.timestamp for log in logs if getattr(log, "timestamp", None) is not None]
    start = min(timestamps) if timestamps else None
    end = max(timestamps) if timestamps else None

    by_ip = Counter()
    by_ip_failed = Counter()
    by_threat = Counter()
    by_status = Counter()

    for log in logs:
        ip = getattr(log, "ip_address", None) or "unknown"
        status = str(getattr(log, "status", "") or "")
        threat = str(getattr(log, "threat_type", "") or "NONE")
        by_ip[ip] += 1
        by_status[status] += 1
        by_threat[threat] += 1
        if status.upper() in ("BLOCKED", "REDACTED"):
            by_ip_failed[ip] += 1

    top_ips = by_ip.most_common(max_entities)
    top_failed = by_ip_failed.most_common(max_entities)
    top_threats = by_threat.most_common(max_entities)

    lines: list[str] = []
    lines.append("# Log Summary")
    if start and end:
        lines.append(f"- Time range: {start.isoformat()} → {end.isoformat()}")
    lines.append(f"- Total events: {len(logs)}")
    lines.append(f"- Status counts: {dict(by_status)}")
    lines.append("")
    lines.append("## Top IPs (all events)")
    for ip, count in top_ips:
        lines.append(f"- {ip}: {count}")
    lines.append("")
    lines.append("## Top IPs (blocked/redacted)")
    for ip, count in top_failed:
        lines.append(f"- {ip}: {count}")
    lines.append("")
    lines.append("## Top Threat Types")
    for threat, count in top_threats:
        lines.append(f"- {threat}: {count}")

    return "\n".join(lines)


def build_forensics_prompt(logs: list[SecurityLog]) -> dict:
    """
    Returns both the summaries and the ready-to-send forensic prompt.

    IMPORTANT: The prompt includes explicit guidance to chunk/summarize inputs (do not send raw large logs).
    """
    summary = summarize_logs_for_forensics(logs)
    prompt = build_log_forensic_prompt(summary)
    return {
        "log_summaries": summary,
        "prompt": prompt,
        "chunking_guidance": (
            "If you have very large logs, summarize/chunk by time window (e.g., 5-15 minutes), "
            "aggregate counts by IP/status/threat_type, then run a final aggregation pass."
        ),
    }

