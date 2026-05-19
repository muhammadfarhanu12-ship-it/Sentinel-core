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
  risk_level?: string | null;
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
  threatActivityFeed?: {
    timestamp: string;
    status: string;
    threat_type: string;
    severity: string;
    request_id: string;
    attack_signature: string;
  }[];
  policyTriggerCounts?: Record<string, number>;
  attackSeverityChart?: { severity: string; count: number }[];
  toolInterceptionMetrics?: {
    totalToolCalls: number;
    requires2FA: number;
    intercepted: number;
    approved: number;
  };
  leakPreventionMetrics?: {
    findings: number;
    blockedEvents: number;
    redactedEvents: number;
  };
  topAttackSignatures?: { signature: string; count: number }[];
  userRiskHeatmap?: { user: string; average_risk_score: number; events: number }[];
  securityTimeline?: { date: string; clean: number; blocked: number }[];
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

export type Verdict = 'allow' | 'warn' | 'block';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SecurityContextSource =
  | 'user_input'
  | 'external_content'
  | 'webpage'
  | 'email'
  | 'social_post'
  | 'document'
  | 'tool_output';

export type SecurityOperation = 'chat' | 'tool_call' | 'financial_action' | 'code_execution' | 'data_access';

export interface SecurityScanContext {
  source: SecurityContextSource;
  trusted: boolean;
  operation: SecurityOperation;
  user_confirmed?: boolean;
}

export interface MatchedSignal {
  category: string;
  signal: string;
  variant_source?: string;
  severity?: string;
}

export interface DecodedVariant {
  source: string;
  text: string;
  confidence?: number;
}

export interface SecurityScanRequest {
  prompt?: string;
  text?: string;
  provider?: string;
  model?: string;
  securityTier?: string;
  security_tier?: string;
  context?: SecurityScanContext;
  tool_call?: {
    name: string;
    args?: Record<string, unknown>;
  };
  tool_2fa_code?: string;
}

export interface SecurityScanResponse {
  status?: string;
  decision?: string;
  verdict?: Verdict | string;
  security_tier?: string;
  enabled_features?: string[];
  risk_score?: number;
  threat_score?: number;
  riskScore?: number;
  threatScore?: number;
  score?: number;
  risk_level?: RiskLevel | string;
  risk_level_detail?: RiskLevel | string;
  detected_categories?: string[];
  matched_signals?: MatchedSignal[];
  decoded_variants?: DecodedVariant[];
  context_analysis?: ContextAnalysis;
  anonymization?: AnonymizationSummary;
  prompt_scan?: Record<string, unknown>;
  logic_check?: LogicCheckResult | Record<string, unknown>;
  explanation?: string;
  recommended_action?: string;
  response?: string;
  security_enforcement?: Record<string, unknown>;
  sentinel_verdict?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  security_report?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ContextAnalysis {
  session_id?: string | null;
  is_payload_splitting?: boolean;
  risk_score?: number;
  risk_level?: RiskLevel | string;
  verdict?: Verdict | string;
  matched_signals?: MatchedSignal[];
  context_window_size?: number;
  explanation?: string;
  recommended_action?: string;
  skipped?: boolean;
}

export interface AnonymizationSummary {
  original_contains_pii?: boolean;
  pii_counts?: Record<string, number>;
  token_count?: number;
  tokens?: { token: string; type: string }[];
}

export interface LogicViolation {
  rule: string;
  expected: string;
  observed: string;
  severity?: string;
}

export interface LogicCheckResult {
  is_valid?: boolean;
  verdict?: Verdict | string;
  risk_score?: number;
  risk_level?: RiskLevel | string;
  violations?: LogicViolation[];
  safe_response?: string;
  explanation?: string;
}

export interface PiiScanResponse {
  contains_pii: boolean;
  severity: string;
  detected_pii_types: string[];
  findings: Record<string, unknown>[];
  redacted_text: string;
  redaction_events: Record<string, unknown>[];
  recommended_action: string;
}

export interface OutputLeakScanResponse {
  verdict: Verdict | string;
  action: string;
  leak_risk: string;
  findings: Record<string, unknown>[];
  sensitive_data_categories: string[];
  redacted_output: string;
  recommended_action: string;
}

export interface FinancialGuardrailResponse {
  verdict: Verdict | string;
  action: string;
  risk_score: number;
  risk_level: RiskLevel | string;
  requires_2fa: boolean;
  review_required: boolean;
  detections: Record<string, unknown>[];
  policy_matches: Record<string, unknown>[];
  tool_interception: Record<string, unknown>;
  explanation: string;
  recommended_action: string;
}

export interface ToolInterceptionResponse {
  tool_name: string;
  simulated: boolean;
  allowed: boolean;
  action: string;
  risk_score: number;
  risk_level: RiskLevel | string;
  requires_2fa: boolean;
  review_required: boolean;
  tool_interception: Record<string, unknown>;
  tool_context_firewall: Record<string, unknown>;
  detections: Record<string, unknown>[];
  recommended_action: string;
}

export interface SecurityMetric {
  counters: Record<string, number>;
  latest: Record<string, { value: unknown; timestamp: string }>;
  window_metrics: Record<string, unknown>;
}
