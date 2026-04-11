const DEFAULT_BACKEND_ORIGIN =
  window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8000' : 'http://localhost:8000';
const DEFAULT_BACKEND_WS_ORIGIN =
  window.location.hostname === '127.0.0.1' ? 'ws://127.0.0.1:8000' : 'ws://localhost:8000';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function stripApiSuffix(value: string): string {
  return stripTrailingSlash(value).replace(/\/api(?:\/v1)?$/i, '');
}

export function resolveBackendOrigin(): string {
  const configuredOrigin = stripApiSuffix(
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '',
  );
  if (configuredOrigin) return configuredOrigin;

  const isLocalFrontend =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const isGatewayPort = window.location.port === '5173' || window.location.port === '5174';

  // Prefer the local gateway/proxy during development so the UI gets JSON 5xx errors
  // instead of a browser-level connection refusal when the backend is unavailable.
  if (isLocalFrontend && isGatewayPort) {
    return window.location.origin;
  }

  return DEFAULT_BACKEND_ORIGIN;
}

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveBackendOrigin()}${normalizedPath}`;
}

function toWebSocketOrigin(origin: string): string {
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}`;
  if (origin.startsWith('http://')) return `ws://${origin.slice('http://'.length)}`;
  return origin;
}

export function resolveBackendWebSocketOrigin(): string {
  const configuredWsOrigin = stripTrailingSlash(
    import.meta.env.VITE_API_WS_URL || import.meta.env.VITE_WS_URL || import.meta.env.VITE_SOCKET_URL || '',
  );
  if (configuredWsOrigin) return configuredWsOrigin;

  const configuredHttpOrigin = stripApiSuffix(
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '',
  );
  if (configuredHttpOrigin) return toWebSocketOrigin(configuredHttpOrigin);

  return DEFAULT_BACKEND_WS_ORIGIN;
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
