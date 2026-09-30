export interface MefyxOptions {
  /** Deployment origin, e.g. http://localhost:8000. Do not append /api/v1. */
  baseUrl: string;
  /** Sent as X-API-Key. Mutually exclusive with bearerToken. */
  apiKey?: string;
  /** Sent as Authorization: Bearer <token>. */
  bearerToken?: string;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ScanContext {
  source?: 'user_input' | 'external_content' | 'webpage' | 'email' | 'social_post' | 'document' | 'tool_output' | null;
  operation?: 'chat' | 'tool_call' | 'financial_action' | 'code_execution' | 'data_access' | null;
  [key: string]: unknown;
}

export interface ScanRequestFields {
  provider?: string;
  model?: string;
  /** Optional backend security tier override; omission uses the plan's default. */
  security_tier?: string | null;
  /** Backend-supported alias of security_tier. */
  securityTier?: string | null;
  session_id?: string | null;
  request_id?: string | null;
  conversation_id?: string | null;
  conversation_history?: string[] | null;
  untrusted_content?: string | null;
  tool_call?: { name: string; args?: Record<string, unknown> } | null;
  tool_2fa_code?: string | null;
  context?: ScanContext | null;
  metadata?: Record<string, unknown> | null;
}

/** Supply prompt or text. Values and entitlements are validated by the server. */
export type ScanRequest = ScanRequestFields & (
  | { prompt: string; text?: string | null }
  | { prompt?: string | null; text: string }
);

/** Known scan fields; additional backend analysis fields remain available as unknown. */
export interface ScanResult {
  status: string;
  decision: string;
  threat_type: string;
  threat_types: string[];
  /** Normalized 0-100 score, not a measured detection rate. */
  risk_score: number;
  /** Normalized 0-1 score. */
  threat_score: number;
  explanation: string;
  sanitized_content: string;
  provider: string;
  model: string;
  security_tier: string;
  enabled_features: string[];
  requires_2fa: boolean;
  review_required: boolean;
  request_id: string | null;
  [key: string]: unknown;
}

export type GatewayProvider = 'gemini' | 'openai' | 'anthropic' | 'xai';

export interface GatewayMessage {
  /** Defaults to user on the server. */
  role?: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayChatRequestFields {
  provider?: GatewayProvider;
  model?: string;
  temperature?: number | null;
  max_tokens?: number | null;
  metadata?: Record<string, unknown> | null;
  /** Free-text request label, not a managed project. */
  project?: string | null;
  app_name?: string | null;
}

/** Non-empty messages take precedence over prompt when both are provided. */
export type GatewayChatRequest = GatewayChatRequestFields & (
  | { prompt: string; messages?: GatewayMessage[] | null }
  | { prompt?: string | null; messages: GatewayMessage[] }
);

export interface GatewayUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  estimated: boolean;
}

export interface GatewaySecurity {
  decision: string;
  risk_score: number;
  threat_type: string | null;
  matched_policies: string[];
  status: string;
  requires_2fa: boolean;
  review_required: boolean;
}

export interface GatewayChatResponse {
  provider: string;
  model: string;
  content: string;
  usage: GatewayUsage;
  security: GatewaySecurity;
  request_id: string;
}

export class MefyxApiError extends Error {
  constructor(message: string, options: {
    status: number;
    code: string;
    details?: unknown;
    body?: unknown;
  });
  status: number;
  code: string;
  details: unknown;
  /** Parsed response body, or raw text if the response was not JSON. */
  body: unknown;
}

export class Mefyx {
  constructor(options: MefyxOptions);
  scan(request: ScanRequest, options?: RequestOptions): Promise<ScanResult>;
  chat(request: GatewayChatRequest, options?: RequestOptions): Promise<GatewayChatResponse>;
}
