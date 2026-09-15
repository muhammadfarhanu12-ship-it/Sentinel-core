export type LogEvent = {
  id: string;
  timestamp: string;
  ts: string;
  date: string;
  epoch: number;
  status: string;
  threat: string | null;
  threatTypes: string[];
  risk: number | null;
  provider: string;
  model: string;
  apiKey: string | null;
  tokens: number | null;
  latency: string;
  policies: string[];
  prompt: string;
  requestId: string;
  endpoint: string;
  method: string;
  requires2fa: boolean | null;
  reviewRequired: boolean | null;
  isNew: boolean;
};

export const STATUS_FILTERS = ['All', 'Blocked', 'Allowed', 'MFA Required', 'Clean', 'Redacted'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const THREAT_FILTERS = ['All', 'Injection', 'Data Leak', 'Financial', 'Tool Abuse', 'Exfiltration'] as const;
export type ThreatFilter = (typeof THREAT_FILTERS)[number];
export const TIME_RANGES = {
  'Last 1 hour': 60 * 60 * 1000,
  'Last 6 hours': 6 * 60 * 60 * 1000,
  'Last 24 hours': 24 * 60 * 60 * 1000,
  'Last 7 days': 7 * 24 * 60 * 60 * 1000,
} as const;
export type TimeRange = keyof typeof TIME_RANGES;
export const MAX_LOGS = 1000;

const NOT_RECORDED = 'Not recorded';
// Match the backend's threats_service.THREAT_TYPE_ALIASES without changing recorded labels.
const THREAT_TYPE_ALIASES: Record<string, string> = {
  PII: 'DATA_LEAK',
  PII_EXPOSURE: 'DATA_LEAK',
  OUTPUT_LEAK: 'DATA_LEAK',
  LEAK: 'DATA_LEAK',
  JAILBREAK: 'PROMPT_INJECTION',
  POLICY_BYPASS: 'PROMPT_INJECTION',
  INDIRECT_INJECTION: 'PROMPT_INJECTION',
  BASE64_OBFUSCATION: 'ENCODING_OBFUSCATION',
  HEX_OBFUSCATION: 'ENCODING_OBFUSCATION',
  MORSE_OBFUSCATION: 'ENCODING_OBFUSCATION',
  FINANCIAL_RISK: 'AML_VIOLATION',
  FINANCIAL_ACTION: 'AML_VIOLATION',
  SECRET_EXFILTRATION: 'DATA_EXFILTRATION',
  API_KEY_THEFT: 'CREDENTIAL_THEFT',
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function identifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value)?.trim() ?? null;
}

function recordedBoolean(...values: unknown[]): boolean | null {
  if (values.includes(true)) return true;
  if (values.includes(false)) return false;
  return null;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Map the public log document returned by list_logs and /ws/logs. */
export function mapSecurityLog(value: unknown, isNew = false): LogEvent {
  const source = record(value);
  const id = identifier(source.id);
  if (id === null) throw new Error('Invalid security log: id must be a non-empty string or a finite number.');

  const timestamp = text(source.timestamp);
  const epoch = timestamp === null ? NaN : Date.parse(timestamp);
  if (timestamp === null || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp) || !Number.isFinite(epoch)) {
    throw new Error(`Invalid security log ${id}: timestamp must be a valid ISO date-time.`);
  }
  const rawStatus = text(source.status)?.trim().toUpperCase();
  if (!rawStatus) throw new Error(`Invalid security log ${id}: status must be a non-empty string.`);

  const date = new Date(epoch);
  const threat = text(source.threat_type)?.trim().toUpperCase() ?? null;
  const threatTypes = [...new Set([
    threat,
    ...(Array.isArray(source.threat_types) ? source.threat_types.map((value) => text(value)?.trim().toUpperCase() ?? null) : []),
  ].filter((value): value is string => value !== null && value !== 'NONE'))];
  const latency = number(source.latency_ms);
  const threatScore = number(source.threat_score);
  const rawPayload = record(source.raw_payload);
  const toolInterception = record(source.tool_interception);
  const enforcement = record(source.security_enforcement);
  const policies = Array.isArray(source.policy_matches)
    ? source.policy_matches.flatMap((value) => {
      const policy = record(value);
      const name = text(value) ?? text(policy.policy_name) ?? text(policy.name) ?? identifier(policy.id);
      return name === null ? [] : [name];
    })
    : [];

  return {
    id,
    timestamp,
    ts: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`,
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    epoch,
    // The backend aliases ALLOWED to CLEAN. Preserve unfamiliar statuses for display.
    status: rawStatus === 'ALLOWED' ? 'CLEAN' : rawStatus,
    threat: threat === 'NONE' ? null : threat,
    threatTypes,
    // Stored risk_score already uses 0..100, including small values such as 0.5.
    risk: number(source.risk_score) ?? (threatScore === null ? null : threatScore * 100),
    provider: text(source.provider) ?? NOT_RECORDED,
    model: text(source.model) ?? NOT_RECORDED,
    apiKey: identifier(source.api_key_id),
    tokens: number(source.tokens_used),
    latency: latency === null ? NOT_RECORDED : `${latency}ms`,
    policies: [...new Set(policies)],
    prompt: text(rawPayload.prompt_preview) ?? NOT_RECORDED,
    requestId: text(source.request_id) ?? NOT_RECORDED,
    endpoint: text(source.endpoint) ?? NOT_RECORDED,
    method: text(source.method) ?? NOT_RECORDED,
    requires2fa: recordedBoolean(source.requires_2fa, toolInterception.requires_2fa),
    reviewRequired: recordedBoolean(source.review_required, enforcement.review_required),
    isNew,
  };
}

export function statusMatches(log: LogEvent, filter: StatusFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Blocked') return log.status === 'BLOCKED';
  if (filter === 'Redacted') return log.status === 'REDACTED';
  if (filter === 'MFA Required') return log.requires2fa === true || log.status === 'MFA';
  if (filter === 'Allowed') return log.status === 'CLEAN' || log.status === 'ALLOWED';
  return log.status === 'CLEAN';
}

export function threatMatches(log: LogEvent, filter: ThreatFilter): boolean {
  if (filter === 'All') return true;
  return log.threatTypes.some((recordedThreat) => {
    const threat = THREAT_TYPE_ALIASES[recordedThreat] ?? recordedThreat;
    if (filter === 'Injection') return threat.includes('INJECTION');
    if (filter === 'Data Leak') return threat === 'DATA_LEAK' || threat === 'KYC_LEAK';
    if (filter === 'Financial') return ['FINANCIAL_FRAUD', 'WALLET_DRAIN', 'AML_VIOLATION'].includes(threat);
    if (filter === 'Tool Abuse') return threat === 'TOOL_ABUSE' || threat === 'CREDENTIAL_THEFT';
    return threat === 'DATA_EXFILTRATION';
  });
}

export function matchesSecurityLog(
  log: LogEvent,
  filters: { search: string; statusFilter: StatusFilter; threatFilter: ThreatFilter; timeRange: TimeRange },
  now = Date.now(),
): boolean {
  if (log.epoch < now - TIME_RANGES[filters.timeRange] || log.epoch > now) return false;
  if (!statusMatches(log, filters.statusFilter) || !threatMatches(log, filters.threatFilter)) return false;
  const search = filters.search.trim().toLowerCase();
  if (!search) return true;
  return [
    log.id, log.requestId, log.apiKey, log.prompt, log.endpoint, log.method,
    log.status, ...log.threatTypes, log.provider, log.model, ...log.policies,
    log.timestamp, log.date, log.ts,
  ].filter((value) => value !== null && value !== NOT_RECORDED).join(' ').toLowerCase().includes(search);
}

/** Reconcile overlapping fetches and live events without duplicate rows or lost highlights. */
export function mergeSecurityLogs(
  current: readonly LogEvent[],
  incoming: readonly LogEvent[],
  limit = MAX_LOGS,
): LogEvent[] {
  const byId = new Map<string, LogEvent>();
  for (const log of [...current, ...incoming]) {
    const previous = byId.get(log.id);
    byId.set(log.id, previous?.isNew && !log.isNew ? { ...log, isNew: true } : log);
  }
  return [...byId.values()]
    .sort((a, b) => b.epoch - a.epoch || b.id.localeCompare(a.id, undefined, { numeric: true }))
    .slice(0, Math.max(0, Math.floor(limit)));
}
