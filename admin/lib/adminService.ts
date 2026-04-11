import api from './api';
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
  const response = await api.post<ApiEnvelope<{ access_token: string }>>('/auth/login', payload);
  return unwrapEnvelope(response.data);
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
