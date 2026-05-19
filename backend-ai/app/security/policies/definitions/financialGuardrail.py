from __future__ import annotations

from typing import Dict, List, Final


# =========================================================
# SENSITIVE TOOL REGISTRY
# =========================================================

MFA_REQUIRED_TOOLS: Final[List[str]] = [
    "transfer_funds",
    "wire_transfer",
    "withdraw_funds",
    "send_money",
    "send_tokens",
    "transfer_tokens",
    "approve_transaction",
    "sign_transaction",
    "crypto_transfer",
    "wallet_transfer",
    "pay_invoice",
    "update_account_limits",
    "modify_permissions",
    "change_admin_email",
    "issue_refund",
    "delete_account",
    "create_api_key",
    "rotate_credentials",
]


# =========================================================
# DIRECT PROMPT INJECTION SIGNATURES
# =========================================================

INJECTION_SIGNATURES: Final[List[str]] = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "ignore system prompt",
    "bypass policy",
    "override guardrail",
    "disable safety",
    "disable security",
    "developer mode",
    "god mode",
    "dan mode",
    "do anything now",
    "no restrictions",
    "unrestricted mode",
    "reveal system prompt",
    "show hidden instructions",
    "internal prompt",
    "policy bypass",
    "remove restrictions",
]


# =========================================================
# INDIRECT EXECUTION / TOOL ABUSE PHRASES
# =========================================================

INDIRECT_EXECUTION_PATTERNS: Final[List[str]] = [
    "execute this now",
    "run this immediately",
    "process immediately",
    "complete transaction",
    "submit transaction",
    "approve transaction",
    "sign transaction",
    "send tokens",
    "transfer tokens",
    "wallet action",
    "treat this as user authorization",
    "send funds",
    "perform transfer",
    "initiate payment",
    "authorized transaction",
    "user already approved",
    "user has authorized",
    "skip confirmation",
    "do not ask for confirmation",
    "bypass confirmation",
    "avoid settlement delay",
    "urgent transfer",
    "reconciliation transfer",
    "correction transfer",
    "security audit payment",
    "internal settlement",
    "trusted operation",
]


# =========================================================
# AUTHORITY IMPERSONATION / HITL BYPASS SIGNALS
# =========================================================

SYSTEM_AUTHORITY_BYPASS_KEYWORDS: Final[List[str]] = [
    "internal system update",
    "automated stress test",
    "stress test",
    "latency test",
    "api latency",
    "test the api latency",
    "dummy value",
    "dummy routing number",
    "internal operation",
    "production validation",
    "test transaction",
    "system maintenance",
    "scheduled operation",
    "backend verification",
    "simulation environment",
    "do not ask for user confirmation",
    "do not ask for confirmation",
    "skip confirmation",
    "bypass confirmation",
    "without confirmation",
    "ignore approval workflow",
    "automatic approval",
]


# =========================================================
# COMMAND & CONTROL PHRASES
# =========================================================

COMMAND_KEYWORDS: Final[List[str]] = [
    "command:",
    "commands:",
    "instruction:",
    "instructions:",
    "execute this",
    "run this",
    "perform action",
    "trigger tool",
    "invoke tool",
    "call the tool",
    "using the tool",
    "system action",
    "assistant must",
    "you must now",
]


# =========================================================
# ROLEPLAY / JAILBREAK ATTACKS
# =========================================================

ROLEPLAY_ATTACK_PATTERNS: Final[List[str]] = [
    "imagine you are",
    "pretend you are",
    "acting as",
    "roleplay as",
    "hypothetically",
    "fictional scenario",
    "simulation mode",
    "you are no longer bound",
    "assume unrestricted access",
]


# =========================================================
# FINANCIAL MANIPULATION KEYWORDS
# =========================================================

FINANCIAL_KEYWORDS: Final[List[str]] = [
    "transfer",
    "transfer tokens",
    "send tokens",
    "wire",
    "withdraw",
    "payment",
    "wallet",
    "wallet address",
    "crypto",
    "token",
    "drb",
    "usdt",
    "eth",
    "btc",
    "invoice",
    "settlement",
    "transaction",
    "funds",
    "refund",
    "deposit",
    "bank transfer",
    "financial correction",
    "reconciliation",
    "credit adjustment",
    "audit account",
]


# =========================================================
# SENSITIVE DATA TARGETING
# =========================================================

DATA_EXFILTRATION_PATTERNS: Final[List[str]] = [
    "show api key",
    "reveal credentials",
    "display token",
    "database password",
    "connection string",
    "private key",
    "secret key",
    "jwt token",
    "session token",
    "admin password",
    "export user data",
    "show customer data",
    "dump database",
]


# =========================================================
# HIGH-RISK URGENCY / SOCIAL ENGINEERING
# =========================================================

SOCIAL_ENGINEERING_PATTERNS: Final[List[str]] = [
    "urgent",
    "immediately",
    "asap",
    "high priority",
    "confidential request",
    "trusted request",
    "executive request",
    "security override",
    "internal request",
    "emergency action",
]


# =========================================================
# ENTERPRISE THREAT WEIGHTS
# =========================================================

THREAT_WEIGHTS: Final[Dict[str, float]] = {
    "signature_match": 0.28,
    "restricted_tool_match": 0.50,
    "command_keyword_match": 0.20,
    "indirect_execution_match": 0.30,
    "roleplay_attack_match": 0.25,
    "financial_keyword_match": 0.15,
    "data_exfiltration_match": 0.45,
    "social_engineering_match": 0.12,
}


# =========================================================
# THREAT THRESHOLDS
# =========================================================

LOW_THREAT_THRESHOLD: Final[float] = 0.30
MEDIUM_THREAT_THRESHOLD: Final[float] = 0.55
HIGH_THREAT_THRESHOLD: Final[float] = 0.75
CRITICAL_THREAT_THRESHOLD: Final[float] = 0.90


# =========================================================
# MAX SECURITY LIMITS
# =========================================================

MAX_PROMPT_LENGTH: Final[int] = 25000
MAX_DECODE_DEPTH: Final[int] = 3
MAX_TOOL_CALLS_PER_REQUEST: Final[int] = 5


# =========================================================
# SECURITY RESPONSE ACTIONS
# =========================================================

SECURITY_ACTIONS: Final[Dict[str, str]] = {
    "LOW": "ALLOW_WITH_LOGGING",
    "MEDIUM": "SANDBOX_AND_MONITOR",
    "HIGH": "BLOCK_AND_REQUIRE_REVIEW",
    "CRITICAL": "BLOCK_AND_FORCE_MFA",
}


# =========================================================
# SAFE INTERNAL SYSTEM TOKENS
# =========================================================

SAFE_SYSTEM_CONTEXT_MARKERS: Final[List[str]] = [
    "<UNTRUSTED_DATA>",
    "</UNTRUSTED_DATA>",
    "[SYSTEM]",
    "[SECURITY_POLICY]",
]
