# Sentinel-Core AI Gateway App

Sentinel-Core is an AI security gateway and analyst dashboard for protecting LLM applications from prompt injection, data leakage, unsafe tool execution, and abuse. The repository contains three deployable surfaces:

- `backend-ai/`: FastAPI API, auth, MongoDB access, AI security enforcement, audit/reporting endpoints, and WebSockets.
- `frontend/`: React/Vite user dashboard, playground, logs, reports, billing, settings, and API key workflows.
- `admin/`: React/Vite admin portal for operators.

## Local Setup

`.env.example` files in this repo are optional templates only. Runtime uses the real local `.env` files:

- `backend-ai/.env`
- `frontend/.env`
- `admin/.env`

Never commit real `.env` files. Vercel and Render do not automatically read your local `.env` files; production variables must be configured in their dashboards.

### Backend

```powershell
cd backend-ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend runtime reads `backend-ai/.env` locally and Render environment variables in production. `.env.example` is only a safe starter template.

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Default local frontend URL: `http://127.0.0.1:5173`.

The frontend runtime reads `frontend/.env` locally and Vercel environment variables in production.

### Admin Portal

```powershell
cd admin
npm install
copy .env.example .env
npm run dev
```

Default local admin URL: `http://127.0.0.1:5174`.

The admin runtime reads `admin/.env` locally and Vercel environment variables in production.

## Required Environment Variables

Backend:

- `APP_ENV` (`production` enables stricter startup checks)
- `MONGODB_URI`
- `MONGO_DB_NAME`
- `JWT_SECRET`
- `API_KEY_SECRET`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `ADMIN_FRONTEND_URL`
- `BACKEND_PUBLIC_URL`

Frontend:

- `VITE_API_BASE_URL`
- `VITE_API_URL`
- `VITE_API_WS_URL`
- `VITE_ADMIN_APP_ORIGIN`

Admin:

- `VITE_API_BASE_URL`
- `VITE_API_URL`
- `VITE_FRONTEND_APP_ORIGIN`

Optional production integrations include `GEMINI_API_KEY`, `OPENAI_API_KEY`, SMTP variables, Stripe variables, Sentry, OAuth client credentials, and remediation webhook URLs.

## Tier Behavior

Plan limits are enforced by the backend, not by frontend state.

| Plan | Monthly requests | Rate limit | Prompt limit | API keys | Security tier access | Model access | Audit retention |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| Free | 1,000 | 30/min | 4,000 chars | 1 | Free | local, Gemini | 7 days |
| Pro | 50,000 | 300/min | 12,000 chars | 5 | Free, Pro | local, OpenAI, Gemini | 30 days |
| Business | 250,000 | 1,200/min | 25,000 chars | Unlimited | Free, Pro, Business | local, OpenAI, Gemini, Anthropic | 365 days |

`POST /api/v1/scan` and `POST /api/v1/gateway/chat` derive the active plan from the authenticated user/API key context. A client cannot unlock a stronger security tier, model, prompt size, rate limit, API-key count, or monthly quota by editing request JSON or frontend state.

Billing/payment status: Stripe checkout is wired as the production payment boundary. If Stripe is not configured, paid-plan checkout returns `payment_not_configured` and does not mutate the user's subscription. Free-plan/local compatibility remains available for development.

## AI Gateway Runtime Lifecycle

The production scan/gateway path is:

1. Frontend/API client sends `POST /api/v1/scan` or `POST /api/v1/gateway/chat` with bearer JWT or `x-api-key`.
2. Backend authenticates JWT or resolves the API key hash from MongoDB and loads the user.
3. Backend derives the active tier, validates requested model/security tier, applies per-minute and monthly quota checks, and rejects oversized prompts.
4. Security enforcement runs pre-model: decoding, prompt-injection checks, indirect-injection context analysis, PII handling, policy evaluation, tool-call interception, and 2FA/human-review signals where enabled.
5. Clean requests receive an allow verdict; blocked/redacted requests never need a downstream provider call.
6. Gateway requests are forwarded to Gemini/OpenAI only after allow decisions.
7. Response metadata is normalized and output-leak scanning is applied to generated/security output.
8. Usage, cost-relevant token estimates, security logs, gateway usage records, remediation records, notifications, and audit events are persisted to MongoDB.
9. Errors return the standard `{ success, data, error }` envelope without prompts, secrets, API keys, JWTs, or provider keys.

## Gateway Proxy

`POST /api/v1/gateway/chat` forwards allowed requests to configured AI providers after Sentinel-Core enforcement. It supports `gemini` and `openai` providers.

Example request:

```json
{
  "provider": "gemini",
  "model": "gemini-3.1-pro",
  "messages": [
    { "role": "user", "content": "Write a short deployment checklist." }
  ],
  "temperature": 0.2,
  "max_tokens": 512,
  "metadata": { "project": "production-api" }
}
```

Example success:

```json
{
  "success": true,
  "data": {
    "provider": "gemini",
    "model": "gemini-3.1-pro",
    "content": "Deployment checklist...",
    "usage": {
      "input_tokens": 12,
      "output_tokens": 40,
      "total_tokens": 52,
      "estimated_cost": 0,
      "estimated": true
    },
    "security": {
      "decision": "allow",
      "risk_score": 5,
      "matched_policies": [],
      "status": "CLEAN"
    },
    "request_id": "..."
  },
  "error": null
}
```

Example blocked response:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "policy_blocked",
    "message": "Request blocked by Sentinel-Core policy.",
    "request_id": "..."
  }
}
```

Provider env vars:

- `GEMINI_API_KEY` for Gemini forwarding.
- `OPENAI_API_KEY` for OpenAI forwarding.
- `AI_PROVIDER_TIMEOUT_SECONDS` optional, default `30`.

## API Overview

Recommended REST namespace: `/api/v1`.

- `GET /api/v1/health`: service, database, SMTP, and security startup status.
- `POST /api/v1/auth/signup`, `/login`, `/refresh`, `/logout`: user auth flow.
- `GET /api/v1/auth/me`: current authenticated user.
- `POST /api/v1/scan`: prompt and request security scan.
- `POST /api/v1/gateway/chat`: security-gated AI provider proxy.
- `POST /api/v1/brain/analyze`: AI gateway analysis.
- `GET /api/v1/logs`: security event logs.
- `GET /api/v1/reports/threat-counts`: daily/weekly report series.
- `GET /api/v1/reports/remediations`: remediation/audit records.
- `GET /api/v1/analytics`, `/usage`, `/billing`, `/team`, `/settings`, `/audit-logs`: dashboard data.
- `GET /api/v1/admin/*`: admin portal APIs.

Legacy `/api/*` compatibility routes are retained where implemented.

## Security Notes

- JWTs include issuer, audience, type, expiry, and JTI claims.
- API responses use a consistent `{ success, data, error }` envelope for most JSON APIs.
- CORS must be restricted to the deployed frontend/admin origins in production.
- `APP_ENV=production` rejects wildcard CORS, demo/test auth flows, 2FA demo bypass, missing critical env vars, and placeholder/short secrets.
- Security headers are applied by backend middleware, including HSTS when enabled.
- Request bodies over `MAX_REQUEST_SIZE_BYTES` are rejected with `413`.
- Auth endpoints are rate limited by IP and email where applicable.
- API key auth is supported with `x-api-key`; keys are stored and compared by SHA-256 hash.
- Sensitive auth payloads are logged only in redacted form.
- Prompt security enforcement includes decoding, anonymization, prompt injection detection, indirect prompt injection handling, tool-call interception, 2FA checks for sensitive tools, output leak scanning, audit trail, and metrics.

## Compatibility Code

The Pydantic models in `backend-ai/app/models/billing.py`, `notification.py`, `remediation_log.py`, and `scan.py`, plus `backend-ai/app/services/user_admin_maintenance_service.py`, are legacy SQL-style compatibility DTOs for tests and maintenance tooling. They do not replace MongoDB collections in production routes. `backend-ai/tests/conftest.py` contains pytest-only in-memory fixtures and FastAPI dependency overrides; these are not imported by the application runtime.

Runtime fallback stores in dashboard services are development/degraded-mode helpers. When `APP_ENV=production`, missing MongoDB access disables in-memory fallback and returns a clear service error.

## Known Limitations

- Distributed rate limiting should use Redis or a managed counter store before horizontally scaling beyond one backend instance; the current limiter is process-local.
- Stripe checkout/session creation is intentionally non-mutating until Stripe credentials are configured.
- Provider pricing is currently zero unless a pricing table is added; token counts are estimated when providers do not return exact usage.
- `python-jose` currently emits `datetime.utcnow()` deprecation warnings internally under Python 3.13; this is dependency-owned.

## Verification Commands

```powershell
cd backend-ai
python -c "import app.main; print('backend import ok')"
python -m pytest -p no:cacheprovider

cd ..\frontend
npm run build
npm run lint

cd ..\admin
npm run build
npm run lint
```

The backend suite includes current Mongo/FastAPI tests plus legacy SQL-style compatibility tests. Compatibility shims for billing, remediation, notifications, scan jobs, admin maintenance, and in-memory pytest fixtures live in `backend-ai/app/models`, `backend-ai/app/services/user_admin_maintenance_service.py`, and `backend-ai/tests/conftest.py`.

Remaining expected warnings are from `python-jose` using `datetime.utcnow()` internally under Python 3.13.

## Deployment Notes

Backend deployment:

- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Configure health check path: `/api/v1/health`.
- Render does not use your local `backend-ai/.env`; add production variables in the Render dashboard.
- Set production `CORS_ORIGINS` to exact frontend and admin URLs.
- Set `APP_ENV=production`.
- Use strong unique values for `JWT_SECRET` and `API_KEY_SECRET`.
- Do not enable `AUTH_DEBUG_TOKEN_LOGGING` or demo bypass settings in production.
- After changing Render environment variables, redeploy the backend service.

Frontend deployment:

- Build command: `npm run build`.
- Output directory: `dist`.
- Vercel does not use your local `frontend/.env`; add production variables in the Vercel dashboard.
- Set `VITE_API_BASE_URL` to the deployed backend `/api/v1` URL or backend origin.
- Set `VITE_API_URL` to the deployed backend origin.
- Set `VITE_API_WS_URL` to the deployed backend WebSocket origin.
- Set `VITE_ADMIN_APP_ORIGIN` to the deployed admin portal origin.
- For this deployment, set:
- `VITE_API_BASE_URL=https://sentinel-core-xcrz.onrender.com`
- `VITE_API_URL=https://sentinel-core-xcrz.onrender.com`
- `VITE_API_WS_URL=wss://sentinel-core-xcrz.onrender.com`
- `VITE_ADMIN_APP_ORIGIN=https://sentinel-admin-beta.vercel.app`
- After changing Vercel environment variables, redeploy with build cache cleared.

Admin deployment:

- Build command: `npm run build`.
- Output directory: `dist`.
- Vercel does not use your local `admin/.env`; add production variables in the Vercel dashboard.
- Point the admin API configuration at `/api/v1/admin` on the deployed backend.
- Set `VITE_API_BASE_URL`, `VITE_API_URL`, and `VITE_FRONTEND_APP_ORIGIN`.
- After changing Vercel environment variables, redeploy with build cache cleared.
