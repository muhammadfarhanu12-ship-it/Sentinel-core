from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, Iterable, List, Optional


# =========================================================
# GRAPH MODELS
# =========================================================


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class GraphNode:
    node_id: str
    node_type: str
    timestamp: str
    risk_score: float
    labels: list[str] = field(default_factory=list)
    confidence: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GraphEdge:
    from_node_id: str
    to_node_id: str
    relation: str
    timestamp: str
    weight: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SecurityContextGraph:
    session_id: str
    nodes: dict[str, list[GraphNode]] = field(default_factory=dict)
    edges: list[GraphEdge] = field(default_factory=list)
    cumulative_risk: float = 0.0
    attack_chain_score: float = 0.0
    attack_flags: dict[str, bool] = field(default_factory=dict)
    detected_patterns: list[str] = field(default_factory=list)
    highest_risk_path: list[str] = field(default_factory=list)
    highest_risk_path_score: float = 0.0
    highest_risk_edge: dict[str, Any] = field(default_factory=dict)
    override_recommendation: str | None = None
    override_reason: str | None = None
    total_events: int = 0
    last_updated: str = field(default_factory=_utc_now)

    def iter_nodes(self) -> list[GraphNode]:
        rows: list[GraphNode] = []
        for group in self.nodes.values():
            rows.extend(group)
        rows.sort(key=lambda node: int(node.metadata.get("sequence", 0)))
        return rows

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "nodes": {
                key: [
                    {
                        "node_id": node.node_id,
                        "node_type": node.node_type,
                        "timestamp": node.timestamp,
                        "risk_score": node.risk_score,
                        "labels": list(node.labels),
                        "confidence": node.confidence,
                        "metadata": dict(node.metadata),
                    }
                    for node in value
                ]
                for key, value in self.nodes.items()
            },
            "edges": [
                {
                    "from_node_id": edge.from_node_id,
                    "to_node_id": edge.to_node_id,
                    "relation": edge.relation,
                    "timestamp": edge.timestamp,
                    "weight": edge.weight,
                    "metadata": dict(edge.metadata),
                }
                for edge in self.edges
            ],
            "cumulative_risk": self.cumulative_risk,
            "attack_chain_score": self.attack_chain_score,
            "attack_flags": dict(self.attack_flags),
            "detected_patterns": list(self.detected_patterns),
            "highest_risk_path": list(self.highest_risk_path),
            "highest_risk_path_score": self.highest_risk_path_score,
            "highest_risk_edge": dict(self.highest_risk_edge),
            "override_recommendation": self.override_recommendation,
            "override_reason": self.override_reason,
            "total_events": self.total_events,
            "last_updated": self.last_updated,
        }


# =========================================================
# STATE STORE
# =========================================================

_GRAPH_LOCK = Lock()
_SESSION_GRAPHS: dict[str, SecurityContextGraph] = {}
_SESSION_COUNTERS: dict[str, int] = {}


# =========================================================
# EVENT/NODE MAPPING
# =========================================================

EVENT_TO_NODE_TYPE: dict[str, str] = {
    "prompt_input": "prompt_input",
    "decode_layer": "decoded_prompt",
    "decoded_prompt": "decoded_prompt",
    "detector_result": "detector_hits",
    "intent_classification": "detected_intent",
    "tool_firewall": "tool_calls",
    "tool_interceptor": "tool_calls",
    "policy_matches": "policy_matches",
    "policy_match": "policy_matches",
    "output_scan": "output_generation",
    "output_generation": "output_generation",
    "risk_event": "risk_events",
    "final_decision": "risk_events",
}

EDGE_PRECEDENCE: dict[str, list[tuple[str, str]]] = {
    "decoded_prompt": [("prompt_input", "transforms_into")],
    "detector_hits": [("decoded_prompt", "triggers"), ("prompt_input", "triggers")],
    "detected_intent": [("detector_hits", "influences"), ("decoded_prompt", "influences")],
    "tool_calls": [("detected_intent", "escalates_to"), ("detector_hits", "escalates_to")],
    "policy_matches": [("tool_calls", "influences"), ("detector_hits", "influences")],
    "output_generation": [("tool_calls", "influences"), ("detector_hits", "influences")],
    "risk_events": [
        ("output_generation", "escalates_to"),
        ("policy_matches", "escalates_to"),
        ("tool_calls", "escalates_to"),
        ("detector_hits", "escalates_to"),
    ],
}

FINANCIAL_TERMS = (
    "transfer",
    "wire",
    "withdraw",
    "funds",
    "token",
    "tokens",
    "wallet",
    "bank",
    "payment",
    "money",
    "crypto",
)

SENSITIVE_TOOLS = (
    "transfer_funds",
    "wire_transfer",
    "withdraw_funds",
    "send_money",
    "execute_payment",
    "wallet_transfer",
)


# =========================================================
# UTILITIES
# =========================================================


def _normalized_session_id(session_id: str) -> str:
    value = str(session_id or "").strip()
    return value or "anonymous"


def _normalize_float(value: Any, default: float = 0.0) -> float:
    try:
        raw = float(value)
    except (TypeError, ValueError):
        return default

    if raw > 1.0:
        raw = raw / 100.0

    return max(0.0, min(1.0, raw))


def _flatten_text(blob: Any) -> str:
    return str(blob or "").lower()


def _contains_any(value: str, terms: Iterable[str]) -> bool:
    lowered = _flatten_text(value)
    return any(term in lowered for term in terms)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        token = str(value or "").strip()
        if not token:
            continue
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def _latest_node(graph: SecurityContextGraph, node_type: str) -> GraphNode | None:
    group = graph.nodes.get(node_type) or []
    if not group:
        return None
    return group[-1]


def _all_nodes(graph: SecurityContextGraph) -> list[GraphNode]:
    return graph.iter_nodes()


def _next_sequence(session_id: str) -> int:
    sequence = int(_SESSION_COUNTERS.get(session_id, 0)) + 1
    _SESSION_COUNTERS[session_id] = sequence
    return sequence


def _resolve_node_type(event_type: str) -> str:
    return EVENT_TO_NODE_TYPE.get(str(event_type or "").strip(), str(event_type or "risk_events"))


def _extract_labels(node_type: str, data: dict[str, Any]) -> list[str]:
    labels: list[str] = []

    raw_labels = data.get("labels")
    if isinstance(raw_labels, list):
        labels.extend([str(item) for item in raw_labels])

    if node_type == "detector_hits":
        findings = data.get("matched_findings") or data.get("matched_signatures") or []
        if isinstance(findings, list):
            labels.extend(str(item) for item in findings)

        if data.get("has_narrative_injection"):
            labels.append("narrative_prompt_injection")

        narrative_findings = data.get("narrative_findings") or []
        if isinstance(narrative_findings, list):
            for finding in narrative_findings:
                if isinstance(finding, dict):
                    label = finding.get("label")
                    if label:
                        labels.append(str(label))

    if node_type == "tool_calls":
        if data.get("tool_name"):
            labels.append(f"tool:{data.get('tool_name')}")
        if data.get("intercepted"):
            labels.append("tool_intercepted")
        if data.get("blocked"):
            labels.append("tool_blocked")
        if data.get("approved") is False:
            labels.append("tool_unapproved")

    if node_type == "policy_matches":
        matches = data.get("policy_matches") or []
        if isinstance(matches, list):
            for value in matches:
                labels.append(f"policy:{value}")

    if node_type == "decoded_prompt":
        if int(data.get("artifact_count", 0) or 0) > 0:
            labels.append("decoded_payload")
        if data.get("timed_out"):
            labels.append("decode_timeout")

    if node_type == "output_generation" and data.get("contains_sensitive_data"):
        labels.append("output_sensitive_data")

    if node_type == "risk_events" and data.get("action"):
        labels.append(f"action:{data.get('action')}")

    return _dedupe(labels)


def _repetition_weight(graph: SecurityContextGraph, labels: list[str]) -> float:
    if not labels:
        return 0.0
    recent_nodes = _all_nodes(graph)[-12:]
    repeats = 0
    target = set(labels)
    for node in recent_nodes:
        if target.intersection(node.labels):
            repeats += 1
    return min(0.20, repeats * 0.03)


def _extract_node_confidence(data: dict[str, Any], risk_score: float) -> float:
    for key in ("confidence", "threat_score", "risk_score", "final_score", "attack_chain_score"):
        if key in data:
            return _normalize_float(data.get(key), default=risk_score)
    return max(0.10, min(1.0, risk_score))


def _extract_node_risk(
    graph: SecurityContextGraph,
    node_type: str,
    labels: list[str],
    data: dict[str, Any],
    confidence: float,
) -> float:
    base = 0.0

    for key in ("risk_score", "threat_score", "final_score", "confidence", "attack_chain_score"):
        if key in data:
            base = max(base, _normalize_float(data.get(key), default=0.0))

    if node_type == "prompt_input":
        base = max(base, 0.05)

    if node_type == "decoded_prompt":
        artifacts = int(data.get("artifact_count", 0) or 0)
        if artifacts > 0:
            base += min(0.30, artifacts * 0.08)
        if data.get("timed_out"):
            base += 0.10
        if data.get("truncated"):
            base += 0.05

    if node_type == "detector_hits":
        base += 0.12
        label_blob = " ".join(labels).lower()
        if "narrative_prompt_injection" in label_blob:
            base += 0.22
        if "jailbreak" in label_blob:
            base += 0.16
        if "prompt_injection" in label_blob:
            base += 0.14
        if "pii" in label_blob:
            base += 0.12

    if node_type == "detected_intent":
        base += min(0.25, _normalize_float(data.get("risk_score", 0.0), 0.0) * 0.40)

    if node_type == "tool_calls":
        tool_name = str(data.get("tool_name") or "")
        if data.get("tool_present") or tool_name:
            base += 0.12
        if _contains_any(tool_name, SENSITIVE_TOOLS):
            base += 0.25
        if _contains_any(str(data.get("tool_args") or ""), FINANCIAL_TERMS):
            base += 0.20
        if data.get("blocked") or data.get("intercepted"):
            base += 0.15
        if data.get("approved") is False:
            base += 0.10

    if node_type == "policy_matches":
        policy_hits = data.get("policy_matches") or []
        if isinstance(policy_hits, list):
            base += min(0.30, len(policy_hits) * 0.10)

    if node_type == "output_generation" and data.get("contains_sensitive_data"):
        base += 0.18

    if node_type == "risk_events":
        action = str(data.get("action") or "").upper()
        if action == "BLOCK":
            base += 0.25
        elif action in {"REVIEW", "FORCE_REVIEW"}:
            base += 0.15

    base += _repetition_weight(graph, labels)
    base = max(base, confidence * 0.30)
    return round(max(0.0, min(1.0, base)), 4)


def _infer_relation(prev: GraphNode, current: GraphNode) -> str:
    if prev.node_type == "prompt_input" and current.node_type == "decoded_prompt":
        return "transforms_into"
    if prev.node_type == "decoded_prompt" and current.node_type == "detector_hits":
        return "triggers"
    if prev.node_type == "detector_hits" and current.node_type in {"detected_intent", "tool_calls"}:
        return "influences"
    if current.risk_score - prev.risk_score >= 0.15:
        return "escalates_to"
    if current.node_type == prev.node_type:
        return "influences"
    return "triggers"


def _edge_weight(prev: GraphNode, current: GraphNode, relation: str) -> float:
    weight = (prev.risk_score + current.risk_score) / 2.0
    if relation == "escalates_to":
        weight += 0.15
    elif relation == "triggers":
        weight += 0.08
    elif relation == "transforms_into":
        weight += 0.10
    return round(max(0.0, min(1.0, weight)), 4)


def _edge_exists(graph: SecurityContextGraph, from_node_id: str, to_node_id: str, relation: str) -> bool:
    for edge in graph.edges:
        if edge.from_node_id == from_node_id and edge.to_node_id == to_node_id and edge.relation == relation:
            return True
    return False


def _append_edge(
    graph: SecurityContextGraph,
    *,
    from_node: GraphNode,
    to_node: GraphNode,
    relation: str,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    if _edge_exists(graph, from_node.node_id, to_node.node_id, relation):
        return

    graph.edges.append(
        GraphEdge(
            from_node_id=from_node.node_id,
            to_node_id=to_node.node_id,
            relation=relation,
            timestamp=_utc_now(),
            weight=_edge_weight(from_node, to_node, relation),
            metadata=metadata or {},
        )
    )


def _link_graph_edges(graph: SecurityContextGraph, node: GraphNode) -> None:
    nodes = _all_nodes(graph)
    if len(nodes) >= 2:
        previous = nodes[-2]
        relation = _infer_relation(previous, node)
        _append_edge(graph, from_node=previous, to_node=node, relation=relation, metadata={"auto": "sequence"})

    for predecessor_type, relation in EDGE_PRECEDENCE.get(node.node_type, []):
        predecessor = _latest_node(graph, predecessor_type)
        if predecessor is None or predecessor.node_id == node.node_id:
            continue
        _append_edge(graph, from_node=predecessor, to_node=node, relation=relation, metadata={"auto": "precedence"})


def _score_path(graph: SecurityContextGraph) -> tuple[float, list[str], float, dict[str, Any]]:
    nodes = _all_nodes(graph)
    if not nodes:
        return 0.0, [], 0.0, {}

    by_id = {node.node_id: node for node in nodes}
    incoming: dict[str, list[GraphEdge]] = {node.node_id: [] for node in nodes}
    for edge in graph.edges:
        if edge.to_node_id in incoming and edge.from_node_id in by_id:
            incoming[edge.to_node_id].append(edge)

    best_score: dict[str, float] = {}
    parent: dict[str, str | None] = {}

    for node in nodes:
        node_base = max(0.01, node.risk_score)
        best_score[node.node_id] = node_base
        parent[node.node_id] = None

        for edge in incoming.get(node.node_id, []):
            from_score = best_score.get(edge.from_node_id, 0.0)
            candidate = from_score + edge.weight + node_base
            if candidate > best_score[node.node_id]:
                best_score[node.node_id] = candidate
                parent[node.node_id] = edge.from_node_id

    best_node_id = max(best_score, key=lambda node_id: best_score[node_id])
    raw_score = best_score[best_node_id]

    path: list[str] = []
    cursor: str | None = best_node_id
    while cursor is not None:
        path.append(cursor)
        cursor = parent.get(cursor)
    path.reverse()

    if path:
        normalizer = max(1.2, (len(path) * 1.35))
    else:
        normalizer = 1.2
    normalized = round(max(0.0, min(1.0, raw_score / normalizer)), 4)

    highest_edge: dict[str, Any] = {}
    if graph.edges:
        top_edge = max(graph.edges, key=lambda row: row.weight)
        highest_edge = {
            "from_node_id": top_edge.from_node_id,
            "to_node_id": top_edge.to_node_id,
            "relation": top_edge.relation,
            "weight": top_edge.weight,
            "metadata": dict(top_edge.metadata),
        }

    return normalized, path, round(raw_score, 4), highest_edge


def _node_label_blob(nodes: list[GraphNode]) -> str:
    return " ".join(" ".join(node.labels) for node in nodes).lower()


def _detect_attack_chains(graph: SecurityContextGraph) -> tuple[dict[str, bool], list[str], str | None, str | None]:
    nodes = _all_nodes(graph)
    if not nodes:
        return {}, [], None, None

    label_blob = _node_label_blob(nodes)
    has_tool_attempt = any(node.node_type == "tool_calls" and node.metadata.get("tool_present") for node in nodes)
    has_financial_context = any(
        _contains_any(str(node.metadata), FINANCIAL_TERMS) or _contains_any(" ".join(node.labels), FINANCIAL_TERMS)
        for node in nodes
    )
    has_decoded_payload = any(
        node.node_type == "decoded_prompt"
        and (int(node.metadata.get("artifact_count", 0) or 0) > 0 or "decoded_payload" in node.labels)
        for node in nodes
    )
    has_narrative = "narrative_prompt_injection" in label_blob
    has_pii = "pii" in label_blob
    has_jailbreak = "jailbreak" in label_blob
    has_prompt_injection = "prompt_injection" in label_blob or "injection" in label_blob

    # A. multi-step injection chain
    low_risk_prompt = any(node.node_type == "prompt_input" and node.risk_score <= 0.40 for node in nodes)
    multi_step_injection_chain = low_risk_prompt and has_decoded_payload and has_tool_attempt

    # B. narrative-to-action escalation
    narrative_to_action_escalation = has_narrative and has_tool_attempt and has_financial_context

    # C. slow poisoning attacks
    recent = nodes[-10:]
    low_signals = [node for node in recent if 0.20 <= node.risk_score <= 0.50]
    slow_poisoning_attack = len(low_signals) >= 4

    # D. cross-layer correlation (PII + jailbreak + tool usage)
    cross_layer_correlation = has_tool_attempt and has_pii and (has_jailbreak or has_prompt_injection)

    # E. decoded payload escalation
    decoded_payload_escalation = has_decoded_payload and (has_prompt_injection or has_jailbreak or has_narrative)

    # Story -> interpretation -> tool call -> execution chain
    has_intent = any(node.node_type == "detected_intent" for node in nodes)
    tool_executed_or_attempted = any(
        node.node_type == "tool_calls" and (node.metadata.get("tool_present") or node.metadata.get("tool_name"))
        for node in nodes
    )
    story_interpretation_tool_execution = has_narrative and has_intent and tool_executed_or_attempted

    recent_window = recent[-6:] if len(recent) >= 6 else recent
    recent_average_risk = (
        sum(node.risk_score for node in recent_window) / len(recent_window)
        if recent_window
        else 0.0
    )
    repeated_escalation_pattern = slow_poisoning_attack and (
        any(node.risk_score >= 0.55 for node in recent_window)
        or recent_average_risk >= 0.38
        or graph.cumulative_risk >= 0.42
        or graph.attack_chain_score >= 0.45
    )

    flags = {
        "multi_step_injection_chain": multi_step_injection_chain,
        "narrative_to_action_escalation": narrative_to_action_escalation,
        "slow_poisoning_attack": slow_poisoning_attack,
        "cross_layer_correlation": cross_layer_correlation,
        "decoded_payload_escalation": decoded_payload_escalation,
        "story_interpretation_tool_execution": story_interpretation_tool_execution,
        "repeated_escalation_pattern": repeated_escalation_pattern,
        "narrative_tool_financial_chain": narrative_to_action_escalation and story_interpretation_tool_execution,
    }

    patterns = [name for name, is_match in flags.items() if is_match]

    recommendation: str | None = None
    reason: str | None = None

    if flags["narrative_tool_financial_chain"]:
        recommendation = "BLOCK"
        reason = "narrative_tool_financial_chain"
    elif flags["story_interpretation_tool_execution"] and has_financial_context:
        recommendation = "BLOCK"
        reason = "story_interpretation_tool_execution"
    elif flags["cross_layer_correlation"]:
        recommendation = "BLOCK"
        reason = "cross_layer_correlation"
    elif flags["repeated_escalation_pattern"]:
        recommendation = "REVIEW"
        reason = "repeated_escalation_pattern"
    elif flags["multi_step_injection_chain"] or flags["decoded_payload_escalation"]:
        recommendation = "REVIEW"
        reason = "decoded_injection_chain"

    return flags, patterns, recommendation, reason


def _recompute_graph(graph: SecurityContextGraph) -> None:
    nodes = _all_nodes(graph)
    if not nodes:
        graph.cumulative_risk = 0.0
        graph.attack_chain_score = 0.0
        graph.attack_flags = {}
        graph.detected_patterns = []
        graph.highest_risk_path = []
        graph.highest_risk_path_score = 0.0
        graph.highest_risk_edge = {}
        graph.override_recommendation = None
        graph.override_reason = None
        graph.last_updated = _utc_now()
        return

    weighted_total = 0.0
    for node in nodes:
        weight = 1.0
        if node.node_type == "detector_hits":
            weight += 0.35
        elif node.node_type == "tool_calls":
            weight += 0.25
        elif node.node_type == "decoded_prompt":
            weight += 0.20
        elif node.node_type == "policy_matches":
            weight += 0.15
        weighted_total += node.risk_score * weight

    average = weighted_total / max(1.0, len(nodes) * 1.25)
    repetition_boost = min(0.20, len(nodes) * 0.01)
    graph.cumulative_risk = round(max(0.0, min(1.0, average + repetition_boost)), 4)

    chain_score, path, raw_path_score, highest_edge = _score_path(graph)
    graph.attack_chain_score = chain_score
    graph.highest_risk_path = path
    graph.highest_risk_path_score = raw_path_score
    graph.highest_risk_edge = highest_edge

    flags, patterns, recommendation, reason = _detect_attack_chains(graph)
    graph.attack_flags = flags
    graph.detected_patterns = patterns
    graph.override_recommendation = recommendation
    graph.override_reason = reason
    graph.total_events = len(nodes)
    graph.last_updated = _utc_now()


def _build_node(
    graph: SecurityContextGraph,
    *,
    session_id: str,
    event_type: str,
    data: dict[str, Any],
) -> GraphNode:
    node_type = _resolve_node_type(event_type)
    sequence = _next_sequence(session_id)
    node_id = f"{session_id}:{sequence}"
    labels = _extract_labels(node_type, data)
    confidence = _extract_node_confidence(data, risk_score=0.0)
    risk = _extract_node_risk(
        graph=graph,
        node_type=node_type,
        labels=labels,
        data=data,
        confidence=confidence,
    )

    node_metadata = dict(data or {})
    node_metadata["event_type"] = event_type
    node_metadata["sequence"] = sequence

    return GraphNode(
        node_id=node_id,
        node_type=node_type,
        timestamp=_utc_now(),
        risk_score=risk,
        labels=labels,
        confidence=round(max(0.0, min(1.0, confidence)), 4),
        metadata=node_metadata,
    )


# =========================================================
# PUBLIC API
# =========================================================


def update_context_graph(
    session_id: str,
    event_type: str,
    data: dict,
) -> SecurityContextGraph:
    """
    Append an event to the session graph and recompute chain risk in real-time.
    """
    normalized_session = _normalized_session_id(session_id)
    payload = dict(data or {})

    with _GRAPH_LOCK:
        graph = _SESSION_GRAPHS.get(normalized_session)
        if graph is None:
            graph = SecurityContextGraph(session_id=normalized_session)
            _SESSION_GRAPHS[normalized_session] = graph
            _SESSION_COUNTERS.setdefault(normalized_session, 0)

        node = _build_node(
            graph,
            session_id=normalized_session,
            event_type=str(event_type or "risk_event"),
            data=payload,
        )

        graph.nodes.setdefault(node.node_type, []).append(node)
        _link_graph_edges(graph, node)
        _recompute_graph(graph)
        return graph


def get_context_graph(session_id: str) -> SecurityContextGraph | None:
    normalized_session = _normalized_session_id(session_id)
    with _GRAPH_LOCK:
        return _SESSION_GRAPHS.get(normalized_session)
