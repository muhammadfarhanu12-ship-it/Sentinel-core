const LOCAL_BACKEND_ORIGIN = 'http://localhost:8000';
export const API_BASE_URL = 'https://sentinel-core-xcrz.onrender.com';
const API_WS_BASE_URL = 'wss://sentinel-core-xcrz.onrender.com';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function stripApiSuffix(value: string): string {
  return stripTrailingSlash(value).replace(/\/api(?:\/v1)?$/i, '');
}

function currentHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
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
  const configuredOrigin = stripApiSuffix(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '',
  );
  if (configuredOrigin) return configuredOrigin;
  return isLocalHostname(currentHostname()) ? LOCAL_BACKEND_ORIGIN : API_BASE_URL;
}

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveBackendOrigin()}${normalizedPath}`;
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
    return fetch(url, requestInit);
  } catch (error) {
    if (!shouldRetryRequest(requestInit.method, undefined, error)) {
      throw error;
    }

    await wait(800);
    return fetch(url, requestInit);
  }
}

export async function apiRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(endpoint, options);
  const payload = await response.json().catch(() => ({}));

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
    import.meta.env.VITE_API_WS_URL || import.meta.env.VITE_WS_URL || import.meta.env.VITE_SOCKET_URL || '',
  );
  const normalizedConfiguredWsOrigin = configuredWsOrigin ? toWebSocketOrigin(configuredWsOrigin) : '';
  if (normalizedConfiguredWsOrigin) return normalizedConfiguredWsOrigin;

  const backendOrigin = resolveBackendOrigin();
  if (!isLocalHostname(currentHostname()) && backendOrigin === API_BASE_URL) {
    return API_WS_BASE_URL;
  }

  return toWebSocketOrigin(backendOrigin);
}

export function resolveAdminApiBaseUrl(): string {
  const configuredAdminOrigin = stripTrailingSlash(import.meta.env.VITE_ADMIN_API_BASE_URL || '');
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
