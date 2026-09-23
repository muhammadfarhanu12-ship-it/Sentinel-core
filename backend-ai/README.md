# Mefyx Gateway - Backend

FastAPI backend for Mefyx AI, the "Cloudflare for AI".

## Setup

1. Create virtual environment: `python -m venv venv`
2. Activate: `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` if you want a starting template, then configure real local values in `backend-ai/.env`.
5. Run server from `backend-ai/`: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

The running backend never uses `.env.example` as runtime config. Local development reads `backend-ai/.env`, while production should use Render environment variables.

## Auth notes

- Frontend HTTP calls should target the versioned API namespace at `/api/v1/...`.
- Production frontend builds should point `VITE_API_URL` to `https://sentinel-core-xcrz.onrender.com`.
- Realtime clients connect directly to `/ws/logs?token=...` and `/ws/notifications?token=...` on the backend origin.
- `/health`, `/api/v1/health`, and the hidden legacy `/api/health` route return `503` with a degraded status when MongoDB is unavailable instead of preventing FastAPI from starting.

## Contact form

`POST /api/v1/contact` is public and accepts JSON with `firstName`, `lastName`, `email`, optional `company`, and `message`. Names must be 1-100 characters each, email must be valid and at most 254 characters, company at most 200 characters, and message 1-5000 characters. Surrounding whitespace is trimmed.

The endpoint uses the existing rate limiter with a separate `contact:ip` scope: five attempts per IP in a rolling 15-minute window, including validation and delivery failures. Excess attempts receive HTTP 429 with `Retry-After`. Like the auth limiter, counters are in memory per server process and reset on restart. Behind a reverse proxy, configure the ASGI server to resolve client IPs only from trusted proxies; the endpoint does not trust raw forwarded headers itself.

Messages use the existing SMTP settings below, go to `support@mefyx.com`, and set `Reply-To` to the visitor's email. HTTP 200 means SMTP accepted the message; configuration or delivery failure returns HTTP 502 with a retry/support message. No database or login is required. Install the updated requirements, including `email-validator`, when deploying.

## Automated remediation

When a threat is detected (e.g. `status=BLOCKED`, `threat_score≈0.99`), Mefyx Gateway automatically:

- Records blocked/redacted requests in `logs` and their remediation outcomes in `reports`.
- Records request quarantine for blocked requests and 2FA enforcement when required.
- Sends a threat alert to the account email for PRO/BUSINESS users with `email_alerts` enabled, provided server email alerts are enabled.
- Records email `SUCCESS` only after the SMTP server accepts the message, `FAILED` on delivery errors, or `SKIPPED` with the reason when disabled or unavailable on the plan. SMTP acceptance does not confirm inbox delivery.

Reports and Threats display each action's actual outcome. Legacy email/webhook success claims without delivery evidence are exposed as `UNKNOWN` (Unverified); stored historical records are preserved.

Customer webhook delivery is not implemented. `REMEDIATION_WEBHOOK_URLS` is deployment-global legacy configuration, and the Settings page's webhook fields are browser-local preferences that are not sent to the backend. Scan remediation does not call those URLs or record a webhook action.

### Config

Set these in `.env` as needed:

- `REMEDIATION_EMAIL_ENABLED=true`
- `REMEDIATION_EMAIL_FROM=alerts@example.com` (aliases: `FROM_EMAIL`, `EMAIL_FROM`)
- `SMTP_HOST=smtp.example.com` (required to actually send email)
- `SMTP_PORT=587`
- `SMTP_USERNAME=...` (alias: `SMTP_USER`)
- `SMTP_PASSWORD=...` (alias: `SMTP_PASS`)
- `SMTP_USE_TLS=true` (STARTTLS; default)
- `SMTP_USE_SSL=false` (for implicit TLS, set this to `true`, set `SMTP_USE_TLS=false`, and use your provider's implicit TLS port)
- `SMTP_TIMEOUT=10` (seconds)

The sender uses Python's `smtplib` with SMTP authentication; no provider-specific API key is required. Configure credentials for your SMTP provider. `REMEDIATION_EMAIL_TO` is a legacy setting and is not used for account threat alerts. Missing SMTP configuration records a failed attempt without interrupting scan recording.

### API (v1)

- `GET /api/v1/reports/threat-counts` returns daily/weekly compliance metrics.
- `GET /api/v1/reports/remediations` returns remediation/audit events.
- `GET /api/v1/reports/*/export?format=csv|json` exports CSV/JSON reports.
