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
  requests_last_7_days: AdminMetricsPoint[];
};

export type AdminSystemStatus = {
  status: string;
  database: string;
  uptime_hint: string;
  admin_count: number;
  last_security_event_at: string | null;
};

export type AdminUser = {
  id: number;
  email: string;
  tier: string;
  organization_name: string | null;
  is_active: boolean;
  monthly_limit: number;
  created_at: string;
  api_usage: number;
  api_key_count: number;
};

export type AdminLog = {
  id: number;
  timestamp: string;
  api_key_id?: number | null;
  user_id?: number | null;
  user_email: string | null;
  status: string;
  threat_type: string | null;
  threat_types?: string[] | null;
  threat_score?: number | null;
  risk_score?: number | null;
  attack_vector?: string | null;
  risk_level?: string | null;
  endpoint: string | null;
  method?: string | null;
  model: string | null;
  latency_ms?: number;
  tokens_used?: number;
  ip_address?: string | null;
  is_quarantined?: boolean;
  raw_payload?: unknown;
};

export type AdminApiKey = {
  id: number;
  user_id: number;
  user_email: string;
  name: string;
  prefix: string | null;
  status: string;
  usage_count: number;
  last_used?: string | null;
  last_ip?: string | null;
  created_at: string;
  key?: string | null;
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

export type AdminUsersQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  isActive?: string;
  tier?: string;
};

export type AdminLogsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  riskLevel?: string;
  threatType?: string;
  onlyQuarantined?: string;
};

export type AdminApiKeysQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
};
