import { clearTokens, getAccessToken, getRefreshToken, isAccessTokenExpired, setTokens } from './auth';
import { buildBackendUrl, parseApiErrorMessage } from './api';

type JsonValue = any;

let refreshInFlight: Promise<string | null> | null = null;

export class HttpError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

function unwrapEnvelope<T = JsonValue>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data as T;
  return payload as T;
}

function resolveRequestTarget(input: RequestInfo | URL): RequestInfo | URL {
  if (input instanceof URL) return input;
  if (typeof input !== 'string') return input;
  if (/^https?:\/\//i.test(input)) return input;
  if (!input.startsWith('/')) return input;
  return buildBackendUrl(input);
}

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const refreshUrl = buildBackendUrl('/api/v1/auth/refresh');
      const res = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const payload = unwrapEnvelope<any>(await res.json().catch(() => null));
      const access = payload?.access_token ? String(payload.access_token) : null;
      if (!access) return null;
      const nextRefresh = payload?.refresh_token ? String(payload.refresh_token) : undefined;
      setTokens(access, nextRefresh);
      return access;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function buildHeaders(initHeaders: HeadersInit | undefined, accessToken: string | null): Headers {
  const headers = new Headers(initHeaders || {});
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  if ((!accessToken || isAccessTokenExpired()) && refreshToken) {
    accessToken = await refreshAccessTokenOnce();
  }

  if (!accessToken && !refreshToken) {
    clearTokens();
    if (window.location.pathname.startsWith('/app')) window.location.assign('/signin');
    return new Response(null, { status: 401, statusText: 'Unauthorized' });
  }

  const firstInit: RequestInit = { ...(init || {}), headers: buildHeaders(init?.headers, accessToken) };

  let res = await fetch(resolveRequestTarget(input), firstInit);
  if (res.status !== 401) return res;

  // If the access token expired/was rotated, refresh once and retry.
  const refreshed = await refreshAccessTokenOnce();
  if (!refreshed) {
    clearTokens();
    if (window.location.pathname.startsWith('/app')) window.location.assign('/signin');
    return res;
  }

  const retryInit: RequestInit = { ...(init || {}), headers: buildHeaders(init?.headers, refreshed) };
  res = await fetch(resolveRequestTarget(input), retryInit);
  if (res.status === 401) {
    clearTokens();
    if (window.location.pathname.startsWith('/app')) window.location.assign('/signin');
  }
  return res;
}

export async function authedFetchJson<T = JsonValue>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await authedFetch(input, init);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = parseApiErrorMessage(payload, `Request failed with status ${res.status}`);
    throw new HttpError(String(message), res.status, payload);
  }
  return unwrapEnvelope<T>(payload);
}
