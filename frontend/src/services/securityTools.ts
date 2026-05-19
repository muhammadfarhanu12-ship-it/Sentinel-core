import { authedFetchJson } from './authenticatedFetch';
import { apiRequest } from './api';
import type {
  DecodedVariant,
  FinancialGuardrailResponse,
  OutputLeakScanResponse,
  PiiScanResponse,
  SecurityMetric,
  SecurityScanContext,
  SecurityScanResponse,
  ToolInterceptionResponse,
  LogicCheckResult,
} from '../types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function body(text: string, context?: SecurityScanContext) {
  return JSON.stringify({ text, prompt: text, context });
}

export interface DecodeResponse {
  original: string;
  variants: DecodedVariant[];
  signals: string[];
}

export function decodePayload(text: string, context?: SecurityScanContext) {
  return authedFetchJson<DecodeResponse>('/api/v1/security/decode', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function scanIndirectPromptInjection(text: string, context?: SecurityScanContext) {
  return authedFetchJson<SecurityScanResponse>('/api/v1/security/indirect-scan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function scanSecurity(
  text: string,
  context?: SecurityScanContext,
  options?: { session_id?: string; request_id?: string; security_tier?: string },
) {
  const securityTier = String(options?.security_tier || 'free').toLowerCase();
  return authedFetchJson<SecurityScanResponse>('/api/v1/scan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      text,
      prompt: text,
      securityTier,
      security_tier: securityTier,
      session_id: options?.session_id,
      request_id: options?.request_id,
      context,
    }),
  });
}

export function scanPromptInjection(text: string, context?: SecurityScanContext) {
  return authedFetchJson<SecurityScanResponse>('/api/v1/security/prompt-scan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function scanPii(text: string, context?: SecurityScanContext) {
  return authedFetchJson<PiiScanResponse>('/api/v1/security/pii-scan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function scanOutputLeak(text: string, context?: SecurityScanContext) {
  return authedFetchJson<OutputLeakScanResponse>('/api/v1/security/output-leak-scan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function checkResponseLogic(text: string, context?: SecurityScanContext) {
  return authedFetchJson<LogicCheckResult>('/api/v1/security/logic-check', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body(text, context),
  });
}

export function checkFinancialGuardrail(text: string, context?: SecurityScanContext) {
  return authedFetchJson<FinancialGuardrailResponse>('/api/v1/security/financial-guardrail', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ text, context, user_confirmed: context?.user_confirmed ?? false }),
  });
}

export function simulateToolCall(
  text: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  context?: SecurityScanContext,
) {
  return authedFetchJson<ToolInterceptionResponse>('/api/v1/security/tool-simulation', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ text, context, tool_name: toolName, tool_args: toolArgs }),
  });
}

export function fetchSecurityMetrics() {
  return authedFetchJson<SecurityMetric>('/api/v1/security/metrics');
}

export function fetchSecurityAuditTrail(limit = 50) {
  return authedFetchJson<{ events: Record<string, unknown>[] }>(`/api/v1/security/audit-trail?limit=${limit}`);
}

export function fetchAttackHistory(sessionId: string) {
  return authedFetchJson<Record<string, unknown>>(`/api/v1/security/attack-history/${encodeURIComponent(sessionId)}`);
}

export function fetchSecurityContext(sessionId: string) {
  return authedFetchJson<Record<string, unknown>>(`/api/v1/security/context/${encodeURIComponent(sessionId)}`);
}

export function fetchSecurityModules() {
  return authedFetchJson<{ modules: { module: string; endpoint: string | null; status: string; reason?: string }[] }>(
    '/api/v1/security/modules',
  );
}

export const getCapabilities = fetchSecurityModules;
export const getSecurityMetrics = fetchSecurityMetrics;
export const getAuditLogs = fetchSecurityAuditTrail;
export const getAttackHistory = fetchAttackHistory;

export function healthCheck() {
  return apiRequest<{ status?: string; [key: string]: unknown }>('/api/v1/health');
}
