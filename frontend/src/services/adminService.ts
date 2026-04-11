import { adminFetchJson } from './adminFetch';
import type {
  AdminApiKey,
  AdminApiKeysQuery,
  AdminLog,
  AdminLogsQuery,
  AdminMetrics,
  AdminSettings,
  AdminSystemStatus,
  AdminUser,
  AdminUsersQuery,
} from '../types/admin';

function withPaging(page = 1, pageSize = 10) {
  return {
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  };
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchAdminMetrics() {
  return adminFetchJson<AdminMetrics>('/metrics');
}

export async function fetchAdminSystemStatus() {
  return adminFetchJson<AdminSystemStatus>('/system-status');
}

export async function fetchAdminUsers(query: AdminUsersQuery = {}) {
  const { page = 1, pageSize = 10, q, isActive, tier } = query;
  return adminFetchJson<AdminUser[]>(
    `/users${buildQuery({
      ...withPaging(page, pageSize),
      q,
      is_active: isActive === 'all' || !isActive ? undefined : isActive,
      tier: tier === 'all' || !tier ? undefined : tier,
    })}`,
  );
}

export async function updateAdminUserStatus(userId: number, isActive: boolean) {
  return adminFetchJson<AdminUser>(`/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function deleteAdminUser(userId: number) {
  return adminFetchJson<{ deleted: boolean; user_id: number }>(`/users/${userId}`, { method: 'DELETE' });
}

export async function fetchAdminLogs(query: AdminLogsQuery = {}) {
  const { page = 1, pageSize = 10, q, status, riskLevel, threatType, onlyQuarantined } = query;
  return adminFetchJson<AdminLog[]>(
    `/logs${buildQuery({
      ...withPaging(page, pageSize),
      q,
      status: status === 'all' || !status ? undefined : status,
      risk_level: riskLevel === 'all' || !riskLevel ? undefined : riskLevel,
      threat_type: threatType === 'all' || !threatType ? undefined : threatType,
      only_quarantined:
        onlyQuarantined === 'all' || !onlyQuarantined ? undefined : String(onlyQuarantined === 'true'),
    })}`,
  );
}

export async function fetchAdminThreats(query: AdminLogsQuery = {}) {
  const { page = 1, pageSize = 10, q, status, riskLevel, threatType, onlyQuarantined } = query;
  return adminFetchJson<AdminLog[]>(
    `/threats${buildQuery({
      ...withPaging(page, pageSize),
      q,
      status: status === 'all' || !status ? undefined : status,
      risk_level: riskLevel === 'all' || !riskLevel ? undefined : riskLevel,
      threat_type: threatType === 'all' || !threatType ? undefined : threatType,
      only_quarantined:
        onlyQuarantined === 'all' || !onlyQuarantined ? undefined : String(onlyQuarantined === 'true'),
    })}`,
  );
}

export async function fetchAdminApiKeys(query: AdminApiKeysQuery = {}) {
  const { page = 1, pageSize = 10, q, status } = query;
  return adminFetchJson<AdminApiKey[]>(
    `/api-keys${buildQuery({
      ...withPaging(page, pageSize),
      q,
      status: status === 'all' || !status ? undefined : status,
    })}`,
  );
}

export async function createAdminApiKey(userId: number, name: string) {
  return adminFetchJson<AdminApiKey>('/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, name }),
  });
}

export async function revokeAdminApiKey(keyId: number) {
  return adminFetchJson<AdminApiKey>(`/api-keys/${keyId}`, { method: 'DELETE' });
}

export async function fetchAdminSettings() {
  return adminFetchJson<AdminSettings>('/settings');
}

export async function updateAdminSettings(payload: AdminSettings) {
  return adminFetchJson<AdminSettings>('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
