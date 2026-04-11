export {};

declare global {
  type ApiError = {
    code: string;
    message: string;
    details?: unknown;
  };

  type ApiResponse<T> = {
    success: boolean;
    data: T | null;
    error: ApiError | null;
  };

  type LogStatus = 'CLEAN' | 'BLOCKED' | 'REDACTED';

  type ThreatType =
    | 'PROMPT_INJECTION'
    | 'DATA_LEAK'
    | 'MALICIOUS_CODE'
    | 'PII_EXPOSURE'
    | 'NONE'
    | string;

  type SecurityLogRecord = {
    id: string;
    timestamp: string;
    api_key_id: string | null;
    status: LogStatus;
    threat_type: ThreatType;
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
    sanitized_content?: string | null;
    raw_prompt?: string | null;
  };
}

