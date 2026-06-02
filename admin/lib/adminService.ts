import api, { buildAdminApiUrl, buildApiUrl } from './api';
import type {
  AdminApiKey,
  AdminApiKeysQuery,
  AdminLog,
  AdminLoginPayload,
  AdminMetrics,
  AdminSettings,
  AdminUser,
  AdminUsersQuery,
  AdminLogsQuery,
} from '../types';

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type AdminLoginResponse = {
  access_token: string;
  token_type: string;
  role?: string;
  user?: {
    role?: string;
  };
};

export const ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  'Server unavailable. Please check your backend connection and try again.';
const isDevelopment = Boolean(import.meta.env.DEV);
const SENSITIVE_RESPONSE_FIELDS = new Set(['password', 'new_password', 'token', 'refresh_token', 'access_token']);

type AdminDashboardResponse = {
  user?: {
    role?: string;
  };
};

function unwrapEnvelope<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as ApiEnvelope<T>)) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString() ? `?${query.toString()}` : '';
}

function pageToParams(page = 1, pageSize = 10) {
  return {
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  };
}

function resolveRole(payload: { role?: string; user?: { role?: string } } | null | undefined): string {
  return String(payload?.role || payload?.user?.role || '').trim().toLowerCase();
}

function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitivePayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const normalizedKey = key.toLowerCase();
        if (SENSITIVE_RESPONSE_FIELDS.has(normalizedKey) || normalizedKey.endsWith('_token')) {
          return [key, '[redacted]'];
        }
        return [key, redactSensitivePayload(item)];
      }),
    );
  }

  return value;
}

function logAdminApiFailure(kind: 'network' | 'api', details: Record<string, unknown>): void {
  if (!isDevelopment) return;
  console.warn('[Sentinel Admin API]', kind, details);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function assertAdminBackendHealthy(): Promise<void> {
  const healthUrl = buildApiUrl('/health');
  let response: Response;
  try {
    response = await fetchWithTimeout(healthUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    logAdminApiFailure('network', {
      url: healthUrl,
      method: 'GET',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    logAdminApiFailure('api', {
      url: healthUrl,
      status: response.status,
      method: 'GET',
      responseBody: redactSensitivePayload(payload),
    });
    throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }
}

export async function verifyAdminSession(accessToken: string): Promise<void> {
  const normalizedToken = String(accessToken || '').trim();
  if (!normalizedToken) {
    throw new Error('Admin authentication failed.');
  }

  const dashboardUrl = buildAdminApiUrl('/dashboard');
  let response: Response;
  try {
    response = await fetchWithTimeout(dashboardUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedToken}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    logAdminApiFailure('network', {
      url: dashboardUrl,
      method: 'GET',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AdminDashboardResponse> | null;
  if (!response.ok || !payload) {
    logAdminApiFailure('api', {
      url: dashboardUrl,
      status: response.status,
      method: 'GET',
      responseBody: redactSensitivePayload(payload),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Admin session expired. Please sign in again.');
    }
    if (response.status >= 500 || response.status === 404) {
      throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
    }
    throw new Error(payload?.error?.message || 'Unable to verify admin session.');
  }

  const dashboard = unwrapEnvelope(payload);
  const role = resolveRole(dashboard?.user || null);
  if (role !== 'admin') {
    throw new Error('Admin access required.');
  }
}

export async function loginAdmin(payload: AdminLoginPayload) {
  await assertAdminBackendHealthy();
  const loginUrl = buildAdminApiUrl('/auth/login');
  let response: Response;

  try {
    response = await fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payload.email.trim(),
        password: payload.password,
      }),
    });
  } catch (error) {
    logAdminApiFailure('network', {
      url: loginUrl,
      method: 'POST',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }

  const responsePayload = (await response.json().catch(() => null)) as ApiEnvelope<AdminLoginResponse> | null;
  if (!response.ok || !responsePayload) {
    logAdminApiFailure('api', {
      url: loginUrl,
      status: response.status,
      method: 'POST',
      responseBody: redactSensitivePayload(responsePayload),
    });
    if (response.status === 404 || response.status >= 500) {
      throw new Error(ADMIN_AUTH_SERVICE_UNAVAILABLE_MESSAGE);
    }
    throw new Error(responsePayload?.error?.message || 'Unable to authenticate with the admin backend.');
  }

  const authPayload = unwrapEnvelope(responsePayload);
  if (!authPayload?.access_token) {
    throw new Error('Admin login did not return an access token.');
  }

  const resolvedRole = resolveRole(authPayload);
  if (resolvedRole !== 'admin') {
    throw new Error('Admin access required.');
  }

  await verifyAdminSession(authPayload.access_token);

  return {
    access_token: authPayload.access_token,
    token_type: authPayload.token_type || 'bearer',
    role: resolvedRole,
  };
}

export async function fetchAdminMetrics() {
  const response = await api.get<ApiEnvelope<AdminMetrics>>('/metrics');
  return unwrapEnvelope(response.data);
}

export async function fetchAdminUsers(query: AdminUsersQuery = {}) {
  const qs = buildQuery({
    ...pageToParams(query.page, query.pageSize),
    q: query.q,
  });
  const response = await api.get<ApiEnvelope<AdminUser[]>>(`/users${qs}`);
  return unwrapEnvelope(response.data);
}

export async function updateAdminUserStatus(userId: number, isActive: boolean) {
  const response = await api.patch<ApiEnvelope<AdminUser>>(`/users/${userId}/status`, { is_active: isActive });
  return unwrapEnvelope(response.data);
}

export async function deleteAdminUser(userId: number) {
  const response = await api.delete<ApiEnvelope<{ deleted: boolean; user_id: number }>>(`/users/${userId}`);
  return unwrapEnvelope(response.data);
}

export async function fetchAdminLogs(query: AdminLogsQuery = {}) {
  const qs = buildQuery({
    ...pageToParams(query.page, query.pageSize),
    q: query.q,
  });
  const response = await api.get<ApiEnvelope<AdminLog[]>>(`/logs${qs}`);
  return unwrapEnvelope(response.data);
}

export async function fetchAdminApiKeys(query: AdminApiKeysQuery = {}) {
  const qs = buildQuery({
    ...pageToParams(query.page, query.pageSize),
    q: query.q,
  });
  const response = await api.get<ApiEnvelope<AdminApiKey[]>>(`/api-keys${qs}`);
  return unwrapEnvelope(response.data);
}

export async function createAdminApiKey(userId: number, name: string) {
  const response = await api.post<ApiEnvelope<AdminApiKey>>('/api-keys', { user_id: userId, name });
  return unwrapEnvelope(response.data);
}

export async function revokeAdminApiKey(keyId: number) {
  const response = await api.delete<ApiEnvelope<AdminApiKey>>(`/api-keys/${keyId}`);
  return unwrapEnvelope(response.data);
}

export async function fetchAdminSettings() {
  const response = await api.get<ApiEnvelope<AdminSettings>>('/settings');
  return unwrapEnvelope(response.data);
}

export async function updateAdminSettings(payload: AdminSettings) {
  const response = await api.put<ApiEnvelope<AdminSettings>>('/settings', payload);
  return unwrapEnvelope(response.data);
}
