import api, { ADMIN_API_BASE_URL } from './api';
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

export async function loginAdmin(payload: AdminLoginPayload) {
  const loginUrl = `${ADMIN_API_BASE_URL}/auth/login`;
  let response: Response;

  try {
    response = await fetch(loginUrl, {
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
  } catch {
    throw new Error(
      `Unable to reach ${loginUrl}. Check that the Render backend is online and allows requests from the admin panel.`,
    );
  }

  const responsePayload = (await response.json().catch(() => null)) as ApiEnvelope<AdminLoginResponse> | null;
  if (!response.ok || !responsePayload) {
    throw new Error(responsePayload?.error?.message || 'Unable to authenticate with the admin backend.');
  }

  const authPayload = unwrapEnvelope(responsePayload);
  if (!authPayload?.access_token) {
    throw new Error('Admin login did not return an access token.');
  }

  const resolvedRole = authPayload.role || authPayload.user?.role;
  if (resolvedRole !== 'admin') {
    throw new Error('Admin access required.');
  }

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
