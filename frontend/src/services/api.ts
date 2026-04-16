const FALLBACK_BACKEND_ORIGIN = 'https://sentinel-core-xcrz.onrender.com';
export const ADMIN_APP_ORIGIN = 'https://sentinel-admin-beta.vercel.app';
const API_PREFIX = '/api/v1';
const FALLBACK_API_BASE_URL = `${FALLBACK_BACKEND_ORIGIN}${API_PREFIX}`;
const FALLBACK_API_WS_BASE_URL = 'wss://sentinel-core-xcrz.onrender.com';
const ALLOWED_BACKEND_HOSTS = new Set(['sentinel-core-xcrz.onrender.com', 'localhost', '127.0.0.1']);
const configuredApiUrl = sanitizeConfiguredBackendUrl(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '');
export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl || FALLBACK_API_BASE_URL);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isAllowedBackendHost(value: string): boolean {
  try {
    return ALLOWED_BACKEND_HOSTS.has(new URL(stripTrailingSlash(value)).hostname);
  } catch {
    return false;
  }
}

function sanitizeConfiguredBackendUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return '';
  }

  return isAllowedBackendHost(normalizedValue) ? normalizedValue : '';
}

function stripApiSuffix(value: string): string {
  return stripTrailingSlash(value).replace(/\/api(?:\/v\d+)?$/i, '');
}

function normalizeApiBaseUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return FALLBACK_API_BASE_URL;
  }

  if (/\/api(?:\/v\d+)?$/i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `${normalizedValue}${API_PREFIX}`;
}

function isAbsoluteBackendPath(path: string): boolean {
  return /^\/(?:api|health)(?:\/|$)/i.test(path);
}

function createNetworkError(url: string, error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`The request to ${url} timed out before the server responded.`);
  }

  if (error instanceof Error && error.message && error.message !== 'Failed to fetch') {
    return new Error(`Request to ${url} failed: ${error.message}`);
  }

  return new Error(
    `Unable to reach ${url}. Check that the Render backend is online and allows requests from this frontend.`,
  );
}

async function parseResponsePayload(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return {};
  }

  return {
    detail: response.statusText || text.trim().slice(0, 200),
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildRequestHeaders(headersInput: HeadersInit | undefined, body: BodyInit | null | undefined): Headers {
  const headers = new Headers(headersInput || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (!body || headers.has('Content-Type') || body instanceof FormData) {
    return headers;
  }

  if (body instanceof URLSearchParams) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    return headers;
  }

  headers.set('Content-Type', 'application/json');
  return headers;
}

function shouldRetryRequest(method: string | undefined, status?: number, error?: unknown): boolean {
  const normalizedMethod = (method || 'GET').toUpperCase();
  const retryableMethod = normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS';
  if (!retryableMethod) return false;

  if (typeof status === 'number') {
    return status === 502 || status === 503 || status === 504;
  }

  return error instanceof TypeError;
}

export function resolveBackendOrigin(): string {
  return stripApiSuffix(API_BASE_URL);
}

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = isAbsoluteBackendPath(normalizedPath) ? resolveBackendOrigin() : API_BASE_URL;
  return `${baseUrl}${normalizedPath}`;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = /^https?:\/\//i.test(endpoint) ? endpoint : buildBackendUrl(endpoint);
  const requestInit: RequestInit = {
    ...options,
    headers: buildRequestHeaders(options.headers, options.body),
  };

  try {
    const response = await fetch(url, requestInit);
    if (!shouldRetryRequest(requestInit.method, response.status)) {
      return response;
    }

    await wait(800);
    return await fetch(url, requestInit);
  } catch (error) {
    if (!shouldRetryRequest(requestInit.method, undefined, error)) {
      throw createNetworkError(url, error);
    }

    await wait(800);
    try {
      return await fetch(url, requestInit);
    } catch (retryError) {
      throw createNetworkError(url, retryError);
    }
  }
}

export async function apiRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(endpoint, options);
  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw new Error(parseApiErrorMessage(payload, 'API request failed'));
  }

  return unwrapApiData<T>(payload);
}

function toWebSocketOrigin(origin: string): string {
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}`;
  if (origin.startsWith('http://')) return `ws://${origin.slice('http://'.length)}`;
  return origin;
}

export function resolveBackendWebSocketOrigin(): string {
  const configuredWsOrigin = stripApiSuffix(
    sanitizeConfiguredBackendUrl(import.meta.env.VITE_API_WS_URL || import.meta.env.VITE_WS_URL || ''),
  );
  const normalizedConfiguredWsOrigin = configuredWsOrigin ? toWebSocketOrigin(configuredWsOrigin) : '';
  if (normalizedConfiguredWsOrigin) return normalizedConfiguredWsOrigin;

  const backendOrigin = resolveBackendOrigin();
  if (backendOrigin === FALLBACK_BACKEND_ORIGIN) return FALLBACK_API_WS_BASE_URL;

  return toWebSocketOrigin(backendOrigin);
}

export function resolveAdminApiBaseUrl(): string {
  const configuredAdminOrigin = stripTrailingSlash(
    sanitizeConfiguredBackendUrl(import.meta.env.VITE_ADMIN_API_BASE_URL || ''),
  );
  if (configuredAdminOrigin) return configuredAdminOrigin;
  return `${resolveBackendOrigin()}/api/v1/admin`;
}

export function buildBackendWebSocketUrl(path: string, params?: Record<string, string | undefined | null>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${resolveBackendWebSocketOrigin()}${normalizedPath}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function parseApiErrorMessage(payload: any, fallback: string): string {
  const validationErrors = payload?.error?.details;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    const firstError = validationErrors[0];
    if (typeof firstError?.msg === 'string' && firstError.msg.trim()) {
      return firstError.msg.trim();
    }
  }

  return String(payload?.error?.message || payload?.detail || payload?.message || fallback);
}
