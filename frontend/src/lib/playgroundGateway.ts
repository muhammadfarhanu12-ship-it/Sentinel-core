import { normalizeRiskLevel, normalizeRiskScore, normalizeVerdict } from './riskScore';

const SENSITIVE_KEY_PATTERNS = [
  'token',
  'secret',
  'key',
  'password',
  'authorization',
  'credential',
  'api_key',
  'jwt',
  'refresh',
  'access',
];

const PROMPT_ECHO_KEYS = new Set(['prompt', 'text', 'content', 'input', 'raw_prompt', 'raw_payload', 'messages']);

export type GatewayPayloadInput = {
  provider: string;
  model: string;
  prompt: string;
  source: string;
  trusted: boolean;
  operation: string;
  securityProfile: string;
  toolName: string;
  toolCategory?: string;
  toolArgs: Record<string, unknown>;
  userConfirmed: boolean;
  financialRisk?: Record<string, unknown>;
};

export type ScanPayloadInput = GatewayPayloadInput & {
  requestId?: string;
};

export type PlaygroundResultEnvelope = {
  decision: string;
  riskScore: number;
  riskLevel: string;
  requestId: string;
  auditId: string;
  provider: string;
  model: string;
  usage: Record<string, unknown>;
  response: string;
  blocked: boolean;
  providerError: boolean;
  modelDenied: boolean;
  quotaExceeded: boolean;
  validationError: boolean;
  serverError: boolean;
  networkError: boolean;
  timeout: boolean;
  requiresMfa: boolean;
  allowed: boolean;
};

export type PlaygroundReadinessInput = {
  gatewayEnabled: boolean;
  providerEnabled: boolean;
  providerConfigured: boolean;
  modelEnabled: boolean;
  modelSelected?: boolean;
  prompt: string;
  maxPromptChars: number;
  toolArgsError?: string | null;
  capabilitiesFallback: boolean;
  executionMode: 'gateway' | 'scan';
};

export type PlaygroundReadinessItem = {
  id: string;
  label: string;
  status: 'ready' | 'warning' | 'blocked';
  detail: string;
};

export type PlaygroundTraceStep = {
  label: string;
  status: 'completed' | 'blocked' | 'skipped' | 'error';
  detail: string;
};

export type PlaygroundAuditPacketInput = {
  result: unknown;
  envelope: PlaygroundResultEnvelope;
  executionMode: 'gateway' | 'scan';
  securityProfile: string;
  completedAt?: string | null;
};

export type PlaygroundRunHistoryItem = {
  id: string;
  completedAt: string;
  executionMode: 'gateway' | 'scan';
  decision: string;
  riskLevel: string;
  riskScore: number;
  provider: string;
  model: string;
  requestId: string;
};

export function buildPlaygroundReadiness(input: PlaygroundReadinessInput): PlaygroundReadinessItem[] {
  const promptLength = input.prompt.length;
  return [
    {
      id: 'capabilities',
      label: 'Capabilities',
      status: input.capabilitiesFallback ? (input.executionMode === 'gateway' ? 'blocked' : 'warning') : 'ready',
      detail: input.capabilitiesFallback
        ? input.executionMode === 'gateway'
          ? 'Backend capabilities are required before provider execution.'
          : 'Using safe fallback for security scan only.'
        : 'Loaded from backend active-plan policy.',
    },
    {
      id: 'gateway',
      label: 'Gateway',
      status: input.gatewayEnabled ? 'ready' : 'blocked',
      detail: input.gatewayEnabled ? 'Gateway execution is available.' : 'Gateway execution is disabled.',
    },
    {
      id: 'provider',
      label: 'Provider',
      status: input.providerEnabled ? 'ready' : 'blocked',
      detail: input.providerEnabled ? 'Provider is executable.' : 'Provider is not executable.',
    },
    {
      id: 'provider_configuration',
      label: 'Provider Key',
      status: input.providerConfigured ? 'ready' : input.executionMode === 'gateway' ? 'blocked' : 'warning',
      detail: input.providerConfigured
        ? 'Provider credentials are configured.'
        : input.executionMode === 'gateway'
          ? 'Gateway run requires a configured provider key.'
          : 'Security scan can run without provider forwarding.',
    },
    {
      id: 'model',
      label: 'Model',
      status: input.modelSelected === false || !input.modelEnabled ? 'blocked' : 'ready',
      detail: input.modelSelected === false
        ? 'Select an executable model.'
        : input.modelEnabled
          ? 'Model is available for the active plan.'
          : 'Model is locked or unavailable.',
    },
    {
      id: 'prompt_size',
      label: 'Prompt Size',
      status: promptLength > input.maxPromptChars ? 'blocked' : promptLength > input.maxPromptChars * 0.8 ? 'warning' : 'ready',
      detail: `${promptLength.toLocaleString()} / ${input.maxPromptChars.toLocaleString()} characters.`,
    },
    {
      id: 'tool_args',
      label: 'Tool Args',
      status: input.toolArgsError ? 'blocked' : 'ready',
      detail: input.toolArgsError || 'Tool args are valid JSON.',
    },
  ];
}

export function isPlaygroundReady(items: PlaygroundReadinessItem[]): boolean {
  return items.every((item) => item.status !== 'blocked');
}

export function buildExecutionTrace(envelope: PlaygroundResultEnvelope, executionMode: 'gateway' | 'scan'): PlaygroundTraceStep[] {
  const terminalError = envelope.validationError || envelope.modelDenied || envelope.quotaExceeded || envelope.providerError || envelope.serverError || envelope.networkError || envelope.timeout;
  const providerSkipped = executionMode === 'scan' || envelope.blocked || envelope.requiresMfa || terminalError;

  return [
    {
      label: 'Auth verified',
      status: envelope.networkError ? 'error' : 'completed',
      detail: envelope.networkError ? 'Backend connection could not be established.' : 'Authenticated request context was accepted by the client.',
    },
    {
      label: 'Account tier loaded',
      status: envelope.validationError || envelope.networkError ? 'skipped' : 'completed',
      detail: envelope.validationError ? 'Request validation failed before tier evaluation.' : 'Backend active-plan policy controls provider and model access.',
    },
    {
      label: 'Provider/model checked',
      status: envelope.modelDenied ? 'blocked' : envelope.validationError || envelope.networkError ? 'skipped' : 'completed',
      detail: envelope.modelDenied ? 'Selected provider/model is not available for the active plan.' : 'Provider/model passed preflight or backend enforcement.',
    },
    {
      label: 'Prompt size checked',
      status: envelope.quotaExceeded ? 'blocked' : envelope.validationError || envelope.networkError ? 'skipped' : 'completed',
      detail: envelope.quotaExceeded ? 'Request exceeded prompt, rate, or quota constraints.' : 'Prompt size was evaluated against active-plan limits.',
    },
    {
      label: 'Rate/monthly quota checked',
      status: envelope.quotaExceeded ? 'blocked' : envelope.validationError || envelope.networkError ? 'skipped' : 'completed',
      detail: envelope.quotaExceeded ? 'Quota enforcement stopped execution.' : 'Rate and monthly quota gates were evaluated.',
    },
    {
      label: 'Prompt scanned',
      status: envelope.validationError || envelope.networkError || envelope.timeout ? 'skipped' : envelope.blocked ? 'blocked' : 'completed',
      detail: envelope.blocked ? 'Mefyx policy blocked the request before provider execution.' : executionMode === 'scan' ? 'Security-only scan completed.' : 'Gateway scan completed before downstream provider handling.',
    },
    {
      label: 'Tool risk classified',
      status: envelope.validationError || envelope.networkError || envelope.timeout ? 'skipped' : 'completed',
      detail: 'Tool context, financial risk, and user confirmation were included when present.',
    },
    {
      label: 'MFA/HITL evaluated',
      status: envelope.requiresMfa ? 'blocked' : envelope.validationError || envelope.networkError || envelope.timeout ? 'skipped' : 'completed',
      detail: envelope.requiresMfa ? 'MFA or human review is required before execution.' : 'No MFA/HITL hold was returned for this run.',
    },
    {
      label: 'Provider call allowed or blocked',
      status: providerSkipped ? (envelope.providerError || envelope.serverError || envelope.timeout ? 'error' : 'skipped') : 'completed',
      detail: executionMode === 'scan'
        ? 'Security scan mode does not call the provider.'
        : envelope.providerError
          ? 'Provider adapter returned a normalized safe error.'
          : envelope.timeout
            ? 'Provider or gateway run timed out.'
            : envelope.blocked || envelope.requiresMfa || terminalError
              ? 'Provider call was not allowed.'
              : 'Provider call was allowed.',
    },
    {
      label: 'Usage/audit logged',
      status: envelope.validationError || envelope.networkError || envelope.timeout ? 'skipped' : 'completed',
      detail: executionMode === 'scan' ? 'Scan audit/log pipeline records the security event.' : 'Gateway usage and audit pipeline records allowed or blocked execution.',
    },
  ];
}

export function buildAuditPacket(input: PlaygroundAuditPacketInput): Record<string, unknown> {
  return {
    audit_event: input.envelope.allowed
      ? 'gateway_request_allowed'
      : input.envelope.blocked
        ? 'gateway_request_blocked'
        : input.envelope.validationError
          ? 'gateway_validation_error'
          : input.envelope.timeout
            ? 'gateway_request_timeout'
            : input.envelope.providerError
              ? 'gateway_provider_error'
              : 'gateway_request_review',
    execution_mode: input.executionMode,
    security_profile: input.securityProfile,
    decision: input.envelope.decision,
    risk_level: input.envelope.riskLevel,
    risk_score: input.envelope.riskScore,
    provider: input.envelope.provider,
    model: input.envelope.model,
    request_id: input.envelope.requestId,
    audit_id: input.envelope.auditId,
    completed_at: input.completedAt || null,
    state: {
      allowed: input.envelope.allowed,
      blocked: input.envelope.blocked,
      requires_mfa: input.envelope.requiresMfa,
      provider_error: input.envelope.providerError,
      model_denied: input.envelope.modelDenied,
      quota_exceeded: input.envelope.quotaExceeded,
      validation_error: input.envelope.validationError,
      timeout: input.envelope.timeout,
      server_error: input.envelope.serverError,
      network_error: input.envelope.networkError,
    },
    sanitized_result: redactForDisplay(input.result),
  };
}

export function buildRunHistoryItem(
  envelope: PlaygroundResultEnvelope,
  executionMode: 'gateway' | 'scan',
  completedAt: string,
): PlaygroundRunHistoryItem {
  return {
    id: `${completedAt}:${envelope.requestId}:${envelope.decision}`,
    completedAt,
    executionMode,
    decision: envelope.decision,
    riskLevel: envelope.riskLevel,
    riskScore: envelope.riskScore,
    provider: envelope.provider,
    model: envelope.model,
    requestId: envelope.requestId,
  };
}

function redactLongText(value: string, reason = 'redacted preview'): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return `${normalized.slice(0, 180)}${normalized.length > 180 ? '...' : ''} [${reason}]`;
}

function looksLikePromptEcho(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    value.length > 240 ||
    lowered.includes('"prompt"') ||
    lowered.includes('"messages"') ||
    lowered.includes('ignore all previous instructions') ||
    lowered.includes('system prompt') ||
    lowered.includes('credit card') ||
    lowered.includes('ssn') ||
    lowered.includes('wire') ||
    lowered.includes('transfer_funds')
  );
}

export function redactForDisplay(value: unknown, keyHint = ''): unknown {
  const normalizedKey = keyHint.toLowerCase();
  if (SENSITIVE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern))) {
    return '[redacted]';
  }

  if (typeof value === 'string') {
    if (PROMPT_ECHO_KEYS.has(normalizedKey) || looksLikePromptEcho(value)) {
      return redactLongText(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForDisplay(item, keyHint));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactForDisplay(item, key)]),
    );
  }

  return value;
}

export function buildGatewayChatPayload(input: GatewayPayloadInput): Record<string, unknown> {
  return {
    provider: input.provider,
    model: input.model,
    messages: [{ role: 'user', content: input.prompt }],
    metadata: {
      source: input.source,
      trusted_content: input.trusted,
      operation: input.operation,
      security_profile: input.securityProfile,
      user_confirmed: input.userConfirmed,
      tool_name: input.toolName,
      tool_category: input.toolCategory || 'none',
      tool_args: input.toolArgs,
      financial_risk: input.financialRisk || {},
      playground: true,
    },
    app_name: 'sentinel-security-test-lab',
  };
}

export function toScanOperation(operation: string): string {
  if (['transfer_funds', 'payment', 'wire', 'wallet', 'banking', 'trading'].includes(operation)) {
    return 'financial_action';
  }
  if (['chat', 'tool_call', 'financial_action', 'code_execution', 'data_access'].includes(operation)) {
    return operation;
  }
  return 'chat';
}

export function buildSecurityScanPayload(input: ScanPayloadInput): Record<string, unknown> {
  return {
    prompt: input.prompt,
    text: input.prompt,
    provider: input.provider,
    model: input.model,
    request_id: input.requestId,
    context: {
      source: input.source,
      trusted: input.trusted,
      operation: toScanOperation(input.operation),
      user_confirmed: input.userConfirmed,
    },
    metadata: {
      source: input.source,
      trusted_content: input.trusted,
      operation: input.operation,
      security_profile: input.securityProfile,
      user_confirmed: input.userConfirmed,
      tool_name: input.toolName,
      tool_category: input.toolCategory || 'none',
      tool_args: input.toolArgs,
      financial_risk: input.financialRisk || {},
      playground: true,
      execution_mode: 'security_scan',
    },
    ...(input.toolName && input.toolName !== 'none'
      ? {
          tool_call: {
            name: input.toolName,
            args: input.toolArgs,
          },
        }
      : {}),
  };
}

export function getPlaygroundResultEnvelope(result: any): PlaygroundResultEnvelope {
  const scan = result?.scan || {};
  const security = result?.gateway?.security || result?.security || result?.error?.details?.security || {};
  const gateway = result?.gateway || {};
  const execution = scan?.execution || {};
  const status = String(scan?.status || result?.status || security?.status || result?.decision || '').toUpperCase();
  const errorCode = String(result?.error?.code || result?.code || result?.error_code || '');
  const errorStatus = Number(result?.error_status || 0);
  const explicitSuccess = typeof result?.success === 'boolean' ? result.success : undefined;
  const success = explicitSuccess === false ? false : explicitSuccess === true || Boolean(result?.gateway) || Boolean(result?.scan);
  const riskScore = normalizeRiskScore(result, security, result?.security_enforcement);
  const scanRiskScore = normalizeRiskScore(scan, execution, scan?.security_enforcement);
  const effectiveRiskScore = scanRiskScore > riskScore ? scanRiskScore : riskScore;
  const riskLevel = normalizeRiskLevel(scan?.risk_level || execution?.risk_level || result?.risk_level || security?.risk_level, effectiveRiskScore);
  const validationError = errorCode === 'validation_error' || errorStatus === 422;
  const blocked = status === 'BLOCKED' || errorCode === 'policy_blocked' || String(security?.decision || '').toLowerCase() === 'block';
  const providerKeyRequired = errorCode === 'provider_not_configured';
  const modelUnavailable = errorCode === 'provider_model_unavailable';
  const providerError = providerKeyRequired || ['provider_timeout', 'provider_auth_error', 'provider_rate_limited', 'gateway_provider_error'].some((code) => errorCode.includes(code));
  const modelDenied = modelUnavailable || errorCode === 'gateway_model_denied' || errorCode === 'model_denied' || errorCode === 'tier_denied';
  const quotaExceeded = errorCode === 'gateway_quota_exceeded' || errorStatus === 429 || errorStatus === 413;
  const timeout = errorCode === 'request_timeout' || errorCode === 'provider_timeout' || errorStatus === 504;
  const serverError = errorCode === 'server_error' || errorCode === 'internal_error' || errorStatus >= 500;
  const networkError = !timeout && (errorCode === 'backend_unreachable' || errorCode === 'network_error' || errorCode === 'cors_error' || result?.request_state === 'network_error');
  const requiresMfa = Boolean(
    result?.requires_2fa ||
      security?.requires_2fa ||
      security?.review_required ||
      result?.security_enforcement?.tool_interception?.requires_2fa ||
      scan?.requires_2fa ||
      scan?.review_required,
  );
  const securityDecision = String(security?.decision || '').toLowerCase();
  const allowed = success && !blocked && !providerError && !modelDenied && !quotaExceeded && !validationError && !timeout && !serverError && !networkError && securityDecision !== 'block';
  const decision = validationError
    ? 'VALIDATION ERROR'
    : providerKeyRequired
      ? 'PROVIDER KEY REQUIRED'
      : modelUnavailable
        ? 'MODEL UNAVAILABLE'
        : errorCode === 'provider_timeout'
          ? 'PROVIDER TIMEOUT'
          : errorCode === 'provider_auth_error'
            ? 'PROVIDER AUTH ERROR'
            : errorCode === 'provider_rate_limited'
              ? 'PROVIDER RATE LIMITED'
              : providerError
                ? 'PROVIDER ERROR'
      : modelDenied
        ? 'MODEL DENIED'
        : quotaExceeded
          ? 'QUOTA EXCEEDED'
          : serverError
            ? timeout
              ? 'REQUEST TIMEOUT'
              : 'SERVER ERROR'
            : networkError
              ? 'NETWORK ERROR'
              : requiresMfa
                ? 'REQUIRES MFA'
                : blocked
                  ? 'BLOCKED'
                  : allowed
                    ? 'ALLOWED'
                    : normalizeVerdict(status || security?.decision || 'ERROR');

  return {
    decision,
    riskScore: effectiveRiskScore,
    riskLevel,
    requestId: String(gateway?.request_id || scan?.request_id || result?.request_id || result?.error?.request_id || result?.error?.details?.request_id || 'pending'),
    auditId: String(result?.audit_id || scan?.security_log_id || result?.security_log_id || result?.gateway?.audit_id || 'logged by gateway/audit pipeline'),
    provider: String(gateway?.provider || execution?.provider || scan?.provider || result?.provider || 'not executed'),
    model: String(gateway?.model || execution?.model || scan?.model || result?.model || 'not executed'),
    usage: gateway?.usage || result?.usage || {},
    response: String(gateway?.content || scan?.response || result?.response || ''),
    blocked,
    providerError,
    modelDenied,
    quotaExceeded,
    validationError,
    serverError,
    networkError,
    timeout,
    requiresMfa,
    allowed,
  };
}
