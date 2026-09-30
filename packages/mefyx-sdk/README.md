# @mefyx/sdk

A minimal, dependency-free ESM client for Node.js 18+ with TypeScript declarations. This package lives in this repository and has **not been published to npm**. Its private flag prevents accidental publication.

From the repository root, install it locally:

```sh
npm install ./packages/mefyx-sdk
```

From another application, use the path to your checkout:

```sh
npm install /path/to/sentinel-dashboard/packages/mefyx-sdk
```

You can also create a local tarball with `npm pack ./packages/mefyx-sdk` and install the resulting `mefyx-sdk-0.1.0.tgz` file. No compile step or runtime dependencies are required. `npm run build --prefix packages/mefyx-sdk` validates JavaScript syntax; `npm test --prefix packages/mefyx-sdk` runs the client tests.

## Configure the client

Set `MEFYX_BASE_URL` to your deployment origin (for example, `http://localhost:8000` during local development), without an `/api` suffix. Set `MEFYX_API_KEY` to an active API key belonging to a verified user. Keep credentials in server-side code.

```js
import { Mefyx, MefyxApiError } from '@mefyx/sdk';

const mefyx = new Mefyx({
  baseUrl: process.env.MEFYX_BASE_URL,
  apiKey: process.env.MEFYX_API_KEY,
});
```

Alternatively pass `bearerToken` for a valid access token. Do not provide both credentials. `apiKey` uses `X-API-Key`; `bearerToken` uses `Authorization: Bearer`. If neither is provided, authentication is left to the deployment, which normally rejects unauthenticated requests. An optional `fetch` implementation can be injected for tests or custom transport.

## Scan a prompt

```js
const scan = await mefyx.scan({
  prompt: 'Summarize this public product description.',
  provider: 'local',
  model: 'local',
  metadata: { source: 'server-example' },
});

console.log(scan.status, scan.risk_score, scan.sanitized_content);
if (scan.status !== 'CLEAN' || scan.review_required || scan.requires_2fa) {
  throw new Error('Request needs security handling before proceeding.');
}
```

This calls `POST /api/v1/scan` and returns the envelope's `data` object. The local provider/model identify standalone scanning; the SDK does not call a local model. Your application must inspect the scan decision and handle blocked, redacted, review, or MFA results before any separate model call. A successfully completed scan can return `status: "BLOCKED"` without throwing an API error.

The request accepts `prompt` or its `text` alias, `provider`, `model`, `security_tier` (or `securityTier`), session/request/conversation IDs, `conversation_history`, `untrusted_content`, `tool_call`, `tool_2fa_code`, `context`, and `metadata`. See `index.d.ts` for exact names. There is no named `policy` selector. Omit the optional security tier to use the backend's plan-dependent default. The client adds no provider, model, or tier defaults; backend validation and entitlements apply.

## Call the gateway

```js
try {
  const result = await mefyx.chat({
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    messages: [{ role: 'user', content: 'Explain how rain forms.' }],
    max_tokens: 256,
    project: 'weather-demo',
  });
  console.log(result.content, result.security, result.usage);
} catch (error) {
  if (error instanceof MefyxApiError) {
    console.error(error.status, error.code, error.details);
  } else {
    throw error;
  }
}
```

This calls `POST /api/v1/gateway/chat`. You can supply `prompt` instead of `messages`; non-empty `messages` take precedence when both are present. Supported provider values are `gemini`, `openai`, `anthropic`, and `xai`. Availability depends on the deployment's provider credentials and your plan's allowed models; query `GET /api/v1/gateway/capabilities` with your credentials to inspect available configured models. Other supported fields are `temperature`, `metadata`, and `app_name`. `project` is a free-text metadata label.

The returned data has `{ provider, model, content, usage, security, request_id }`. Usage contains `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost`, and `estimated`. Security contains `decision`, `risk_score`, `threat_type`, `matched_policies`, `status`, `requires_2fa`, and `review_required`. These are Mefyx's schemas, not an OpenAI-compatible response.

## Errors and cancellation

Non-2xx responses and `{ success: false, error: ... }` envelopes throw `MefyxApiError`, exposing HTTP `status`, API `code`, `details`, and the response `body`. Non-JSON errors retain raw text in `body`. Malformed successful envelopes throw with code `invalid_response`. Network and abort errors pass through unchanged. The SDK does not retry or set a timeout.

```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);
try {
  await mefyx.scan({ prompt: 'Hello', provider: 'local', model: 'local' }, {
    signal: controller.signal,
  });
} finally {
  clearTimeout(timer);
}
```

## Boundaries

This client serializes requests and unwraps JSON responses. It does not perform local PII redaction, select policies by name, automatically intercept another provider's SDK, support streaming, or forward gateway requests to local models. Detection and redaction run on the Mefyx API server after the request reaches it. The current gateway rejects scans with `BLOCKED` or `REDACTED` status before calling its configured provider. Standalone scan responses do not automatically enforce what your application does next.
