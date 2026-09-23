# Marketing claims review

Reviewed on 2026-09-23 against this repository's implementation. Except for the explicitly requested replacement of the Autonomous SOC card, the copy below is unchanged for owner review. An unverified claim means the repository does not establish it; it is not a conclusion about evidence that may exist elsewhere.

Scope: public `LandingPage.tsx`, `Features.tsx`, `Docs.tsx`, `Blog.tsx`, `Pricing.tsx`, `Contact.tsx`, authentication pages, public layout and HTML metadata. The in-app `Documentation.tsx` also contains relevant product claims and is listed separately. Dates, version labels, CSS dimensions, offered prices, and clearly labeled sample values are not treated as measured capabilities.

## Completed cleanup

- `frontend/src/pages/LandingPage.tsx:240`: replaced **Autonomous SOC** with **Policy Enforcement**: "Applies security policies to allow, block, or require review of risky requests." Benefit: "Returns policy matches and enforcement decisions."
- This describes the real pre-model enforcement path in `backend-ai/app/services/security_service.py:714`, including blocked/review decisions at line 737 and serialized policy matches at line 209. `backend-ai/app/security/security_enforcement_layer.py:420` applies policy actions and review decisions. It is distinct from the landing page's injection scanning, PII redaction, SDK, and analytics claims.
- Deleted `backend-ai/app/routers/infrastructure_router.py` and `backend-ai/app/routers/infrastructure_router copy.py`. Before deletion, both contained `# Mock infrastructure script execution` and returned success without isolating anything. Both had SHA-256 `02E3928292F067E18D73A0F069FC7C5C57AA68AB3336B566115563B23EE69E68`. A repository reference search found no imports, router registrations, or callers of their route. `app/main.py` did not register them.

## Public copy requiring review

1. **99.9% threat detection rate** — `frontend/src/pages/LandingPage.tsx:309`.
   - The threat detector combines rule/structural/optional AI scores (`backend-ai/app/services/threat_detection.py:513`) and applies thresholds. These are decision scores, not a measured detection rate. No benchmark establishing 99.9% recall or detection rate was found.

2. **Less than 50 ms added scan latency** — `frontend/src/pages/LandingPage.tsx:313`.
   - `backend-ai/app/services/security_service.py:704` uses dynamic timeouts and its resilience wrapper retries scans. Business scanning can call Gemini (`backend-ai/app/services/threat_detection.py:360`). There is no measured latency benchmark or enforced 50 ms completion bound. Timeout settings alone do not prove typical latency either way.

3. **One-line integration / universal SDK for OpenAI, Anthropic, and local LLMs** — `frontend/src/pages/LandingPage.tsx:66`, `:239`, `:317`.
   - Only example HTTP clients were found (`docs/api_clients/README.md`, `docs/api_clients/javascript/client.js`); no implementation or package manifest for the advertised SDK was found. The backend implements a separate scan API and gateway API. Gateway providers are Gemini, OpenAI, Anthropic, and xAI (`backend-ai/app/services/ai_providers/factory.py:10`; `backend-ai/app/schemas/gateway_schema.py:9`); there is no local LLM forwarding provider. Standalone scanning can be used by a caller integrating a local LLM, but that does not establish the claimed packaged one-line integration.

4. **Installable `@mefyx/sdk`, `new Mefyx`, `mefyx.scan`, and named `policy` selection** — `frontend/src/pages/Docs.tsx:17`, `:29`, `:72` (example through line 81).
   - No corresponding SDK implementation was found in the repository. `backend-ai/app/routers/scan_router.py:96` defines the real request schema, which has no `policy` selector matching `policy: 'production-ai-app'`. The API does enforce actual backend policies, but the documented client and selection syntax are unverified.

5. **Automatically masks PII before it leaves the customer's network** — `frontend/src/pages/LandingPage.tsx:238`.
   - PII detection/redaction exists in `backend-ai/app/services/security_service.py:134` and `:141`, but runs on the API server after the caller submits the prompt. No customer-side SDK or mandatory in-network preprocessing implementation was found. Server-side redaction cannot by itself substantiate the stated network boundary.

6. **Ensures HIPAA and GDPR compliance for AI** — `frontend/src/pages/LandingPage.tsx:238`.
   - The implementation provides technical detection, redaction, and audit controls. No implementation/evidence establishing this unconditional compliance guarantee was found. This finding concerns the unsupported product guarantee; it is not a legal compliance assessment.

7. **Live AI reasoning and chain-of-thought visibility** — `frontend/src/pages/LandingPage.tsx:275`.
   - `backend-ai/app/routers/brain_router.py:69` returns a verdict's `detail` as `reasoning`. `backend-ai/app/services/threat_detection.py:568` assembles concise explanations from detected categories. These are verdict explanations; no live model-internal chain-of-thought stream is exposed by these routes.

8. **Priority scanning** — `frontend/src/pages/LandingPage.tsx:367`; `frontend/src/pages/Pricing.tsx:19`.
   - Tiers provide different quotas, rate limits, allowed models, and scan stages (`backend-ai/app/core/tier.py:139`; `backend-ai/app/services/threat_detection.py:490`). The routes use the same scan execution path. No priority queue, scheduler, worker allocation, or equivalent priority service was found.

9. **Business: unlimited requests** — `frontend/src/pages/LandingPage.tsx:382`.
   - Directly conflicts with `backend-ai/app/core/tier.py:175`, which sets Business to 250,000 requests per month (and 1,200 per minute). The monthly cap is enforced in `backend-ai/app/routers/scan_router.py:245` and `backend-ai/app/routers/gateway_router.py:280`.

10. **Business: unlimited projects** — `frontend/src/pages/Pricing.tsx:28`.
    - `backend-ai/app/schemas/gateway_schema.py:34` accepts a `project` metadata string and the gateway passes it to scan metadata. No project management service or project entitlement model was found. Unlimited metadata labels do not establish the advertised managed-project capability; clarify the intended meaning.

11. **Automated enrichment** — `frontend/src/pages/Features.tsx:43`.
    - Current code attaches local detector labels, policy matches, and remediation outcomes to scan/threat events (`backend-ai/app/services/dashboard_service.py:2372`; `backend-ai/app/services/threats_service.py:317`). No separate threat-intelligence enrichment or external enrichment integration was found. This wording needs a scope decision: it is supportable if it means the existing local event metadata, but broader SOC enrichment is unverified. The adjacent remediation workflow and alert claims do have implementations and were not treated as absent.

## Additional in-app documentation claims

These appear on `/app/docs`, rather than the public `/docs` page. They are unchanged.

12. **Under five minutes to integrate, a drop-in LLM SDK, and `@sentinel/sdk`** — `frontend/src/pages/Documentation.tsx:199`, `:203`, `:205`.
    - No SDK package implementation or timed integration evidence was found. These have the same limitation as public findings 3 and 4.

13. **OpenAI-compatible drop-in `/v1/chat/completions`** — `frontend/src/pages/Documentation.tsx:83` and `:86`.
    - The implemented route is `POST /api/v1/gateway/chat` (`backend-ai/app/routers/gateway_router.py:299`), with its own response schema. No `/v1/chat/completions` route was found. The adjacent `/v1/scan` and `/v1/analytics/threats` examples also omit the application's `/api` prefix; they should be checked in a documentation pass.

14. **Routing and load balancing** — `frontend/src/pages/Documentation.tsx:49`.
    - `backend-ai/app/routers/gateway_router.py` selects the requested provider and calls it; `backend-ai/app/services/ai_providers/factory.py` instantiates that provider. No provider load-balancing or failover selection implementation was found.

15. **Global pattern database / instant protection across customers** — `frontend/src/pages/Documentation.tsx:62` and `:277`.
    - The backend contains local detection rules and workspace-scoped analytics, but no cross-customer signature aggregation and automatic rule-distribution service was found. The instant-protection sentence is within **Implementation Suggestions**; treat it as a proposal, not a shipped guarantee. The architecture diagram currently presents the global pattern database without that qualification.

16. **Millions of security logs per second; specialized fine-tuned LLMs and YARA scanning** — `frontend/src/pages/Documentation.tsx:263` and `:270`.
    - These also occur under **Implementation Suggestions** and are not current guarantees. No ClickHouse ingestion benchmark, YARA integration, or fine-tuned classifier implementation was found. The current detector uses regex/structural rules and an optional `gemini-2.5-flash` classification call (`backend-ai/app/services/threat_detection.py:169`, `:391`, `:490`). If these suggestions are reused as marketing claims, they require independent implementation/evidence first.

## Claims with corresponding implementation or explicit limits

- Free 1,000/month, Pro 50,000/month, a single Free API key, and multiple paid API keys correspond to `backend-ai/app/core/tier.py:139` and enforced entitlements. Offered dollar prices depend on external billing configuration and are commercial offers, not performance claims.
- The landing preview explicitly says **Sample dashboard preview**. Its `98/100` value is illustrative, so it was not counted as a measured security claim.
- Prompt blocking, redaction, scores, policy matches, request audit records, security alerts, remediation outcome records, and manually updated incident status have real implementations in `security_service.py`, `threat_detection.py`, `dashboard_service.py`, and `threats_service.py`.
- The generic cost-visibility claim has a UI implementation, but those values are estimates: `frontend/src/pages/UsageAnalytics.tsx:625` and `:643` use fixed token rates. Backend `gateway_service.py:24` currently has zero token prices. This does not support a claim of accurate or invoiced model-specific costs; the public feature text makes no such quantified promise.
- Raw-payload inspection currently exposes a redacted prompt preview of at most 2,000 characters (`backend-ai/app/services/dashboard_service.py:2435`), rather than complete original payloads. The public text does not promise complete payload retention, but this is the implementation boundary to keep in mind.
- `Blog.tsx` has article dates and general topic descriptions, with no additional quantified product-performance or specific automatic-response promises found. Public contact, authentication, layout, and metadata copy added no further in-scope quantified claims.
