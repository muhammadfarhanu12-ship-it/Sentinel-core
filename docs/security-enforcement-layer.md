# Sentinel-Core Security Enforcement Layer

This document describes the additive AI Security Enforcement Layer integrated into Sentinel-Core.

## Pipeline Order

Sentinel-Core now executes a pre/post security pipeline in this order:

1. Input received
2. Decoder layer (`base64`, `hex`, `morse`, `url`)
3. Prompt sanitizer / instruction neutralization
4. Semantic jailbreak detector
5. Financial guardrail policy engine
6. Indirect injection sandbox wrapper
7. Context monitor (session + conversation)
8. Tool call interceptor (+2FA enforcement)
9. AI model call (existing `ThreatDetectionService`)
10. Output leak scanner
11. Response returned

## Module Layout

New modules were added under:

- `backend-ai/app/security/policies`
- `backend-ai/app/security/preprocessors`
- `backend-ai/app/security/detectors`
- `backend-ai/app/security/scanners`
- `backend-ai/app/security/interceptors`
- `backend-ai/app/security/sandbox`
- `backend-ai/app/security/monitoring`
- `backend-ai/app/security/telemetry`
- `backend-ai/app/security/utils`
- `backend-ai/app/security/tests`

## Feature Flags

Environment controls:

- `SENTINEL_ENABLE_DECODER`
- `SENTINEL_ENABLE_JAILBREAK_DETECTION`
- `SENTINEL_ENABLE_OUTPUT_SCANNER`
- `SENTINEL_ENABLE_CONTEXT_MONITOR`
- `SENTINEL_RISK_THRESHOLD`
- `SENTINEL_MAX_DECODE_DEPTH`

Additional hardening flags:

- `SENTINEL_MAX_DECODE_PAYLOAD_CHARS`
- `SENTINEL_DECODE_TIMEOUT_MS`
- `SENTINEL_REQUIRE_2FA_FOR_SENSITIVE_TOOLS`
- `SENTINEL_ENABLE_2FA_ENFORCEMENT`
- `SENTINEL_2FA_ALLOW_DEMO_BYPASS`
- `SENTINEL_2FA_STATIC_CODE`

## Backward Compatibility

- Existing API routes and response envelopes remain intact.
- New security fields are additive (`security_enforcement`, `risk_score`, `requires_2fa`, `review_required`, log metadata).
- Existing dashboards continue working and now render additional security widgets when data is available.
