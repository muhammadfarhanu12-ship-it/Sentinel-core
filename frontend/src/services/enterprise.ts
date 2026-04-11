import { authedFetch, authedFetchJson } from './authenticatedFetch';
import type {
  AuditLogEntry,
  AuditLogsQuery,
  TeamInvitePayload,
  TeamMember,
  TeamRole,
  UsageSummary,
  UsageTrendPoint,
} from '../types';

const USAGE_ALERT_KEY = 'sentinel_usage_alert_80';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() ? Number(value) || fallback : fallback;
}

function getNested(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
}

function extractList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const record = asRecord(payload);
  const collection = record.data ?? record.items ?? record.results;
  return Array.isArray(collection) ? (collection as T[]) : [];
}

function titleFromEmail(email: string): string {
  const local = email.split('@')[0] || 'team member';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeAuditLog(item: unknown): AuditLogEntry {
  const record = asRecord(item);
  const actorType = asString(getNested(record, ['actor_type', 'actorType']), 'SYSTEM').toUpperCase();
  return {
    id: asString(getNested(record, ['id', 'event_id']), `audit-${Date.now()}`),
    timestamp: asString(getNested(record, ['timestamp', 'created_at']), new Date().toISOString()),
    actor: asString(getNested(record, ['actor', 'actor_email', 'user', 'initiator']), actorType === 'SYSTEM' ? 'System' : 'Unknown user'),
    actor_type: actorType,
    action: asString(getNested(record, ['action', 'event', 'operation']), 'UNKNOWN_ACTION'),
    resource: asString(getNested(record, ['resource', 'target', 'resource_name']), 'Unknown resource'),
    ip_address: asString(getNested(record, ['ip_address', 'ipAddress', 'source_ip'])) || null,
    severity: asString(getNested(record, ['severity', 'level']), 'INFO').toUpperCase(),
    old_value: getNested(record, ['old_value', 'oldValue', 'before']),
    new_value: getNested(record, ['new_value', 'newValue', 'after']),
    metadata: (getNested(record, ['metadata', 'details']) as Record<string, unknown> | undefined) || null,
  };
}

function normalizeTrendPoint(item: unknown): UsageTrendPoint {
  const record = asRecord(item);
  return {
    date: asString(getNested(record, ['date', 'label', 'day']), new Date().toISOString().slice(0, 10)),
    requests: asNumber(getNested(record, ['requests', 'total_requests']), 0),
    threats: asNumber(getNested(record, ['threats', 'blocked_injections', 'blocked']), 0),
  };
}

function normalizeUsage(payload: unknown): UsageSummary {
  const record = asRecord(payload);
  const quota = asRecord(getNested(record, ['quota', 'usage_vs_limit', 'quota_progress']));
  const trendSource = getNested(record, ['trend', 'series', 'last_30_days', 'requests_last_30_days']);
  return {
    totalRequests: asNumber(getNested(record, ['total_requests', 'totalRequests']), 0),
    blockedInjections: asNumber(getNested(record, ['blocked_injections', 'blockedInjections', 'threats_blocked']), 0),
    monthlyCreditsRemaining: asNumber(getNested(record, ['monthly_credits_remaining', 'monthlyCreditsRemaining', 'credits_remaining']), 0),
    quotaUsed: asNumber(getNested(quota, ['used', 'quota_used', 'requests_used']), asNumber(getNested(record, ['quota_used', 'used_requests', 'total_requests']), 0)),
    quotaLimit: asNumber(getNested(quota, ['limit', 'quota_limit', 'request_limit']), asNumber(getNested(record, ['quota_limit', 'monthly_request_limit']), 100000)),
    notifyAt80: typeof getNested(record, ['notify_at_80', 'notifyAt80']) === 'boolean' ? Boolean(getNested(record, ['notify_at_80', 'notifyAt80'])) : getUsageAlertPreference(),
    trend: Array.isArray(trendSource) ? trendSource.map(normalizeTrendPoint) : [],
  };
}

function normalizeTeamMember(item: unknown): TeamMember {
  const record = asRecord(item);
  const email = asString(getNested(record, ['email', 'user_email']), 'unknown@workspace.local');
  return {
    id: asString(getNested(record, ['id', 'member_id']), `member-${Date.now()}`),
    name: asString(getNested(record, ['name', 'full_name', 'display_name']), titleFromEmail(email)),
    email,
    role: asString(getNested(record, ['role']), 'VIEWER').toUpperCase(),
    status: asString(getNested(record, ['status', 'invite_status']), 'PENDING').toUpperCase(),
    invite_link: asString(getNested(record, ['invite_link', 'temporary_invite_link'])) || null,
  };
}

function buildAuditQuery(query: AuditLogsQuery = {}) {
  const params = new URLSearchParams();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 12;
  params.set('limit', String(pageSize));
  params.set('offset', String((page - 1) * pageSize));
  if (query.severity) params.set('severity', String(query.severity));
  if (query.startDate) params.set('start_date', query.startDate);
  if (query.endDate) params.set('end_date', query.endDate);
  return params.toString();
}

export async function fetchAuditLogs(query: AuditLogsQuery = {}): Promise<AuditLogEntry[]> {
  const path = `/api/v1/audit-logs?${buildAuditQuery(query)}`;
  const payload = await authedFetchJson<unknown>(path);
  return extractList<unknown>(payload).map(normalizeAuditLog);
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const payload = await authedFetchJson<unknown>('/api/v1/usage');
  return normalizeUsage(payload);
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const payload = await authedFetchJson<unknown>('/api/v1/team');
  return extractList<unknown>(payload).map(normalizeTeamMember);
}

export async function inviteTeamMember(payload: TeamInvitePayload): Promise<TeamMember> {
  const created = await authedFetchJson<unknown>('/api/v1/team/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: payload.email,
      role: payload.role,
      generate_invite_link: payload.generateInviteLink,
    }),
  });
  return normalizeTeamMember(created);
}

export async function updateTeamMemberRole(id: string, role: TeamRole): Promise<TeamMember> {
  const updated = await authedFetchJson<unknown>(`/api/v1/team/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return normalizeTeamMember(updated);
}

export async function removeTeamMember(id: string): Promise<void> {
  await authedFetch(`/api/v1/team/${id}`, { method: 'DELETE' }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        asString(asRecord(payload).message) ||
        asString(asRecord(payload).detail) ||
        `Failed to remove team member (${response.status})`;
      throw new Error(message);
    }
  });
}

export function getUsageAlertPreference(): boolean {
  return localStorage.getItem(USAGE_ALERT_KEY) !== 'false';
}

export function setUsageAlertPreference(enabled: boolean) {
  localStorage.setItem(USAGE_ALERT_KEY, String(enabled));
}
