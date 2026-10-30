export type AdminLoginPayload = {
  email: string;
  password: string;
};

export type AdminSessionUser = {
  email: string;
  role: string;
  isPlatformAdmin: boolean;
  adminRole?: string | null;
  adminPermissions?: string[];
  adminStatus?: string;
  adminCreatedAt?: string | null;
  adminLastLoginAt?: string | null;
  forcePasswordChange?: boolean;
};

export type AdminMetricsPoint = {
  label: string;
  requests: number;
  threats: number;
};

export type AdminMetrics = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  total_requests: number;
  threats_blocked: number;
  active_api_keys: number;
  quarantined_api_keys: number;
  avg_latency_ms: number;
  requests_last_7_days?: AdminMetricsPoint[];
  threat_activity_feed?: Array<Record<string, unknown>>;
  policy_trigger_counts?: Record<string, number>;
  attack_severity_chart?: Array<Record<string, unknown>>;
  tool_interception_metrics?: Record<string, unknown>;
  leak_prevention_metrics?: Record<string, unknown>;
  top_attack_signatures?: Array<Record<string, unknown>>;
  user_risk_heatmap?: Array<Record<string, unknown>>;
};

export type AdminUser = {
  id: string | number;
  email: string;
  tier: string;
  organization_name: string | null;
  is_active: boolean;
  monthly_limit: number;
  created_at: string;
  api_usage: number;
  api_key_count: number;
};

export type AdminPanelUser = {
  id: string;
  email: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  apiUsage: number;
  apiKeys: number;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
};

export type AdminLog = {
  id: string | number;
  timestamp: string;
  created_at?: string | null;
  api_key_id?: number | null;
  user_id?: number | null;
  user_email?: string | null;
  status: string;
  threat_type?: string | null;
  threat_types?: string[] | null;
  threat_score?: number | null;
  risk_score?: number | null;
  attack_vector?: string | null;
  risk_level?: string | null;
  endpoint?: string | null;
  method?: string | null;
  model?: string | null;
  latency_ms?: number;
  tokens_used?: number;
  ip_address?: string | null;
  is_quarantined?: boolean;
  raw_payload?: unknown;
  severity?: string | null;
  attack_signature?: string | null;
  requires_2fa?: boolean;
  review_required?: boolean;
  policy_matches?: Array<Record<string, unknown>> | null;
  output_findings?: Array<Record<string, unknown>> | null;
  tool_interception?: Record<string, unknown> | null;
};

export type AdminApiKey = {
  id: string | number;
  user_id: string | number;
  user_email: string;
  name: string;
  prefix?: string | null;
  status: string;
  usage_count: number;
  last_used?: string | null;
  last_ip?: string | null;
  created_at: string;
  key?: string | null;
};

export type GlobalApiKey = {
  id: string;
  userId: string;
  userEmail: string;
  prefix: string;
  usage: number;
  lastUsed: string;
  status: 'ACTIVE' | 'REVOKED' | 'QUARANTINED';
};

export type SecurityLog = {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  threatType: string;
  status: 'BLOCKED' | 'REDACTED' | 'CLEAN';
  rawJson: string;
};

export type AdminSettings = {
  enable_gemini_module: boolean;
  enable_openai_module: boolean;
  enable_anthropic_module: boolean;
  ai_kill_switch_enabled: boolean;
  require_mfa_for_admin: boolean;
  admin_rate_limit_per_minute: number;
  admin_rate_limit_window_seconds: number;
  api_key_rate_limit_per_minute: number;
  updated_by_user_id: number | null;
  updated_at: string;
};

export type AdminAuditLog = {
  id: string | number;
  timestamp: string;
  actor?: string | null;
  actor_type?: string | null;
  action: string;
  event_type?: string | null;
  resource?: string | null;
  severity?: string | null;
  ip_address?: string | null;
  request_id?: string | null;
  decision?: string | null;
  risk_score?: number | null;
  matched_policies?: string[];
  provider?: string | null;
  model?: string | null;
  prompt_preview?: string | null;
  metadata?: Record<string, unknown> | null;
  old_value?: unknown;
  new_value?: unknown;
};

export type AdminReportSummary = {
  summary: {
    blocked_attacks: number;
    prompt_injection_attempts: number;
    high_risk_financial_operations: number;
    suspicious_tool_calls: number;
    pii_exposure_attempts: number;
    usage_spikes: number;
    policy_violations: number;
    provider_failures: number;
    model_denied_events: number;
    quota_exceeded_events: number;
  };
  recent_alerts: Array<Record<string, unknown>>;
  realtime_limitations: {
    streaming_alert_bus: boolean;
    note: string;
  };
};

export type AdminUsersQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type AdminLogsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type AdminAuditLogsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
};

export type AdminApiKeysQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type BrowserChartInstance = {
  destroy(): void;
  resize?(): void;
  update?(): void;
};

export type BrowserChartConstructor = new (
  item: HTMLCanvasElement | CanvasRenderingContext2D,
  config: unknown,
) => BrowserChartInstance;

export type BrowserChartWindow = Window & {
  Chart?: BrowserChartConstructor;
};
