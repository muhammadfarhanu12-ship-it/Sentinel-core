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

Messages use the Resend settings below, go to `support@mefyx.com`, and set `Reply-To` to the visitor's email. HTTP 200 means Resend accepted the message; configuration or delivery failure returns HTTP 502 with a retry/support message. No database or login is required. Install the updated requirements, including `email-validator`, when deploying.

## Email delivery and Render deployment

All email uses Resend's HTTPS API at `https://api.resend.com/emails`, including signup verification, password reset, contact submissions, admin login alerts, and account threat alerts.

1. Create an account at [Resend](https://resend.com), then add `mefyx.com` under Domains.
2. In Hostinger's DNS zone for `mefyx.com`, add the sending records displayed by Resend. The dashboard's exact host names and values are authoritative, including any custom return-path subdomain or region. For the default `send` return-path subdomain, the records are:

   | Type | Host/name | Value | Priority |
   | --- | --- | --- | --- |
   | TXT | `resend._domainkey` | The DKIM public key shown in the Resend dashboard | — |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` (use the dashboard's exact value) | — |
   | MX | `send` | The dashboard's region-specific `feedback-smtp.<region>.amazonses.com` target | `10` |

   Use TTL `3600` unless the dashboard specifies otherwise. The `send` MX record supports bounce handling; preserve the root domain's existing MX records so `support@mefyx.com` continues receiving mail. Resend inbound receiving does not need to be enabled. An optional DMARC TXT record at `_dmarc` can start with `v=DMARC1; p=none;` if no DMARC record already exists; preserve or update an existing policy instead of adding a second record. See [Resend's Hostinger DNS guide](https://resend.com/docs/knowledge-base/hostinger).
3. Click Verify in Resend and wait for the domain's sending records to verify. Generate a Resend API key with permission to send from `mefyx.com`.
4. Set these environment variables in Render, then deploy:

   ```dotenv
   RESEND_API_KEY=<your Resend API key>
   EMAIL_FROM_ADDRESS="Mefyx <noreply@mefyx.com>"
   ```

   In Render's environment editor, enter the sender value without surrounding quotes: `Mefyx <noreply@mefyx.com>`. `EMAIL_FROM_ADDRESS` defaults to this value when omitted. Store the key only in backend environment configuration.
5. After deployment, delete all old `SMTP_*` variables from Render, including any aliases (`SMTP_USER`, `SMTP_PASS`, `SMTP_TLS`, `SMTP_SECURE`, `SMTP_SSL`). Also remove the obsolete sender variables `REMEDIATION_EMAIL_FROM`, `REMEDIATION_EMAIL_FROM_NAME`, `FROM_EMAIL`, and `EMAIL_FROM`; the backend now uses `EMAIL_FROM_ADDRESS` exclusively.
6. Confirm signup verification, password reset, and contact form delivery with the verified domain. The health response exposes `email_configured`, which checks that the API key and sender are present; it does not perform a delivery test or verify the domain. Resend acceptance does not guarantee inbox delivery.

## Automated remediation

When a threat is detected (e.g. `status=BLOCKED`, `threat_score≈0.99`), Mefyx Gateway automatically:

- Records blocked/redacted requests in `logs` and their remediation outcomes in `reports`.
- Records request quarantine for blocked requests and 2FA enforcement when required.
- Sends a threat alert to the account email for PRO/BUSINESS users with `email_alerts` enabled, provided server email alerts are enabled.
- Records email `SUCCESS` only after Resend accepts the message, `FAILED` on delivery errors, or `SKIPPED` with the reason when disabled or unavailable on the plan. Resend acceptance does not confirm inbox delivery.

Reports and Threats display each action's actual outcome. Legacy email/webhook success claims without delivery evidence are exposed as `UNKNOWN` (Unverified); stored historical records are preserved.

Customer webhook delivery is not implemented. `REMEDIATION_WEBHOOK_URLS` is deployment-global legacy configuration, and the Settings page's webhook fields are browser-local preferences that are not sent to the backend. Scan remediation does not call those URLs or record a webhook action.

### Config

Set these in `.env` as needed:

- `REMEDIATION_EMAIL_ENABLED=true`
- `RESEND_API_KEY=...` (required to send email)
- `EMAIL_FROM_ADDRESS="Mefyx <noreply@mefyx.com>"` (must use a verified sending domain)

`REMEDIATION_EMAIL_TO` is a legacy setting and is not used for account threat alerts. Missing Resend configuration records a failed attempt without interrupting scan recording.

### API (v1)

- `GET /api/v1/reports/threat-counts` returns daily/weekly compliance metrics.
- `GET /api/v1/reports/remediations` returns remediation/audit events.
- `GET /api/v1/reports/*/export?format=csv|json` exports CSV/JSON reports.
