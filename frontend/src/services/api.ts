export const ADMIN_APP_ORIGIN = import.meta.env.VITE_ADMIN_APP_ORIGIN || 'https://sentinel-admin-beta.vercel.app';
const API_PREFIX = '/api/v1';
const configuredApiUrl = sanitizeConfiguredBackendUrl(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '');
const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8000';
export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl || defaultApiBaseUrl());

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;
  code?: string;

  constructor(message: string, status: number, payload: unknown, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function defaultApiBaseUrl(): string {
  if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
    return `${window.location.origin}${API_PREFIX}`;
  }
  return `${DEFAULT_BACKEND_ORIGIN}${API_PREFIX}`;
}

function sanitizeConfiguredBackendUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return '';
  }

  try {
    const parsed = new URL(normalizedValue);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return '';
    }
    return stripTrailingSlash(parsed.toString());
  } catch {
    return '';
  }
}

function stripApiSuffix(value: string): string {
  return stripTrailingSlash(value).replace(/\/api(?:\/v\d+)?$/i, '');
}

function normalizeApiBaseUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return defaultApiBaseUrl();
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
    `Unable to reach ${url}. Check that the backend server is online and allows requests from this frontend.`,
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
    credentials: options.credentials ?? 'include',
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
    throw new ApiRequestError(
      parseApiErrorMessage(payload, 'API request failed'),
      response.status,
      payload,
      typeof payload?.error?.code === 'string' ? payload.error.code : undefined,
    );
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

  return toWebSocketOrigin(resolveBackendOrigin());
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

  const errorMessage = payload?.error?.message;
  if (typeof errorMessage === 'string' && errorMessage.trim()) {
    return errorMessage.trim();
  }

  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  if (detail && typeof detail === 'object') {
    const detailMessage = detail.message || detail.reason || detail.error;
    if (typeof detailMessage === 'string' && detailMessage.trim()) {
      return detailMessage.trim();
    }
  }

  const topLevelMessage = payload?.message;
  if (typeof topLevelMessage === 'string' && topLevelMessage.trim()) {
    return topLevelMessage.trim();
  }

  return fallback;
}
