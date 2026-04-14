export type ThreatType = 'PROMPT_INJECTION' | 'DATA_LEAK' | 'MALICIOUS_CODE' | 'PII_EXPOSURE' | 'NONE';
export type LogStatus = 'CLEAN' | 'BLOCKED' | 'REDACTED';
export type ApiKeyStatus = 'ACTIVE' | 'REVOKED' | 'QUARANTINED' | 'active' | 'revoked' | 'quarantined';

export interface SecurityLog {
  id: string;
  timestamp: string;
  created_at?: string | null;
  api_key_id: string | null;
  status: LogStatus;
  threat_type: ThreatType | string;
  tokens_used: number;
  latency_ms?: number;
  endpoint?: string | null;
  method?: string | null;
  ip_address?: string | null;
  request_id?: string | null;
  model?: string | null;
  threat_score?: number | null;
  risk_score?: number | null;
  is_quarantined?: boolean | null;
  raw_payload?: unknown;
  sanitized_content?: string;
  raw_prompt?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  // Only returned once on creation (backend does not return raw keys on listing).
  key?: string;
  created_at: string;
  last_used: string | null;
  status: ApiKeyStatus;
  usage_count: number;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string | null;
  timestamp?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface UserSettings {
  scan_sensitivity: string;
  auto_redact_pii: boolean;
  block_on_injection: boolean;
  alert_threshold: number;
  email_alerts: boolean;
  in_app_alerts: boolean;
  max_daily_scans: number;
}

export type RemediationActionType =
  | 'QUARANTINE_API_KEY'
  | 'QUARANTINE_REQUEST'
  | 'ALERT_EMAIL'
  | 'ALERT_WEBHOOK';

export type RemediationActionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface RemediationAction {
  type: RemediationActionType | string;
  status: RemediationActionStatus | string;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RemediationLog {
  id: string;
  timestamp?: string | null;
  created_at: string;
  user_id?: string | null;
  api_key_id?: string | null;
  security_log_id?: string | null;
  request_id?: string | null;
  threat_type?: string | null;
  threat_score?: number | null;
  actions: RemediationAction[];
  email_to?: string | null;
  webhook_urls?: string[] | null;
  error?: string | null;
}

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actor_type: 'USER' | 'SYSTEM' | string;
  action: string;
  resource: string;
  ip_address: string | null;
  severity: AuditSeverity | string;
  old_value?: unknown;
  new_value?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogsQuery {
  page?: number;
  pageSize?: number;
  severity?: AuditSeverity | string;
  startDate?: string;
  endDate?: string;
}

export interface UsageTrendPoint {
  date: string;
  requests: number;
  threats: number;
}

export interface UsageSummary {
  totalRequests: number;
  blockedInjections: number;
  monthlyCreditsRemaining: number;
  quotaUsed: number;
  quotaLimit: number;
  notifyAt80: boolean;
  trend: UsageTrendPoint[];
}

export type TeamRole = 'OWNER' | 'ADMIN' | 'VIEWER';
export type TeamStatus = 'ACTIVE' | 'PENDING';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole | string;
  status: TeamStatus | string;
  invite_link?: string | null;
}

export interface TeamInvitePayload {
  email: string;
  role: TeamRole;
  generateInviteLink: boolean;
}

export interface Analytics {
  totalThreatsBlocked: number;
  promptInjectionsDetected: number;
  dataLeaksPrevented: number;
  apiRequestsToday: number;
  securityScore: number;
  threatsOverTime: { date: string; clean: number; blocked: number }[];
  usageVsLimit: { used: number; limit: number };
}

export interface UserAccount {
  id: string;
  email: string;
  tier: 'FREE' | 'PRO' | 'BUSINESS';
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'ANALYST' | 'VIEWER';
  isActive?: boolean;
  organizationName?: string | null;
  isAdmin?: boolean;
  name?: string;
}
