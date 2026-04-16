# Sentinel AI Security Gateway - Backend

FastAPI backend for Sentinel, the "Cloudflare for AI".

## Setup

1. Create virtual environment: `python -m venv venv`
2. Activate: `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and configure.
5. Run server from `backend-ai/`: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

## Auth notes

- Frontend HTTP calls should target the versioned API namespace at `/api/v1/...`.
- Production frontend builds should point `VITE_API_URL` to `https://sentinel-core-xcrz.onrender.com`.
- Realtime clients connect directly to `/ws/logs?token=...` and `/ws/notifications?token=...` on the backend origin.
- `/health`, `/api/v1/health`, and the hidden legacy `/api/health` route return `503` with a degraded status when MongoDB is unavailable instead of preventing FastAPI from starting.

## Automated remediation

When a threat is detected (e.g. `status=BLOCKED`, `threat_score≈0.99`), Sentinel automatically:

- Quarantines the API key (sets `api_keys.status=QUARANTINED`)
- Marks the triggering request/event as quarantined (`security_logs.is_quarantined=1`)
- Writes an audit entry to `remediation_logs`
- Sends an alert email (SMTP) and optional webhook callbacks (if configured)

### Config

Set these in `.env` as needed:

- `REMEDIATION_ENABLED=true`
- `REMEDIATION_THREAT_SCORE_THRESHOLD=0.9`
- `REMEDIATION_EMAIL_ENABLED=true`
- `REMEDIATION_EMAIL_FROM=sentinel@localhost`
- `REMEDIATION_EMAIL_TO=secops@example.com` (optional; falls back to the user email)
- `SMTP_HOST=smtp.example.com` (required to actually send email)
- `SMTP_PORT=587`
- `SMTP_USERNAME=...`
- `SMTP_PASSWORD=...`
- `SMTP_USE_TLS=true`
- `REMEDIATION_WEBHOOK_URLS=https://example.com/webhook,https://example2.com/hook` (optional)
- `REMEDIATION_WEBHOOK_TIMEOUT_SECONDS=3`

### API (v1)

- `GET /api/v1/remediation/logs` lists remediation events for the authenticated user.
- `GET /api/v1/reports/threat-counts` returns daily/weekly compliance metrics.
- `GET /api/v1/reports/remediations` returns remediation/audit events.
- `GET /api/v1/reports/*/export?format=csv|json` exports CSV/JSON reports.
