import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSecurityLog,
  matchesSecurityLog,
  MAX_LOGS,
  mergeSecurityLogs,
  STATUS_FILTERS,
  statusMatches,
  threatMatches,
  TIME_RANGES,
} from '../lib/securityLogs';

// Public shape from dashboard_service.persist_scan_result (datetime is serialized to ISO).
const scanLog = {
  id: 42,
  api_key_id: 12,
  timestamp: '2026-09-15T10:11:12.345678+00:00',
  status: 'BLOCKED',
  threat_type: 'PROMPT_INJECTION',
  threat_score: 0.92,
  risk_score: 92,
  tokens_used: 24,
  latency_ms: 75,
  endpoint: '/api/v1/scan',
  method: 'POST',
  model: 'gemini-1.5-flash',
  provider: 'gemini',
  request_id: 'req_backend123',
  raw_payload: { prompt_preview: 'Ignore previous instructions; [REDACTED]' },
  policy_matches: [{ policy_name: 'Prompt injection guard', policy_version: '1', action: 'BLOCK', severity: 'HIGH', score: 92 }],
  tool_interception: {},
  requires_2fa: false,
  review_required: true,
};

const now = Date.parse(scanLog.timestamp);
const allFilters = { search: '', statusFilter: 'All', threatFilter: 'All', timeRange: 'Last 1 hour' } as const;

test('maps real persisted scan fields and keeps the original timestamp', () => {
  const log = mapSecurityLog(scanLog, true);
  assert.equal(log.id, '42');
  assert.equal(log.apiKey, '12');
  assert.equal(log.timestamp, scanLog.timestamp);
  assert.equal(log.epoch, now);
  assert.match(log.ts, /^\d{2}:\d{2}:\d{2}\.345$/);
  assert.equal(Date.parse(`${log.date}T${log.ts}`), now, 'display date and time represent the original instant locally');
  assert.equal(log.risk, 92);
  assert.equal(log.tokens, 24);
  assert.equal(log.latency, '75ms');
  assert.equal(log.provider, 'gemini');
  assert.equal(log.model, 'gemini-1.5-flash');
  assert.equal(log.prompt, scanLog.raw_payload.prompt_preview);
  assert.deepEqual(log.policies, ['Prompt injection guard']);
  assert.equal(log.requestId, 'req_backend123');
  assert.equal(log.endpoint, '/api/v1/scan');
  assert.equal(log.method, 'POST');
  assert.equal(log.requires2fa, false);
  assert.equal(log.reviewRequired, true);
  assert.equal(log.isNew, true);
  assert.equal('tokIn' in log, false);
  assert.equal('tokOut' in log, false);
  assert.equal('cost' in log, false);
});

test('missing telemetry stays unknown and NONE is not a threat', () => {
  const log = mapSecurityLog({ id: 'mongo-id', timestamp: scanLog.timestamp, status: 'clean', threat_type: 'NONE' });
  assert.equal(log.status, 'CLEAN');
  assert.equal(log.threat, null);
  assert.deepEqual(log.threatTypes, []);
  assert.equal(log.apiKey, null);
  assert.equal(log.risk, null);
  assert.equal(log.tokens, null);
  assert.equal(log.requires2fa, null);
  assert.equal(log.reviewRequired, null);
  assert.equal(statusMatches(log, 'MFA Required'), false);
  for (const field of ['latency', 'provider', 'model', 'prompt', 'requestId', 'endpoint', 'method'] as const) {
    assert.equal(log[field], 'Not recorded');
  }
  assert.deepEqual(log.policies, []);
  assert.equal(log.isNew, false);
});

test('stored 0..100 risk wins even at zero or fractional values; threat_score is only a fallback', () => {
  for (const risk of [0, 0.5, 1, 92]) {
    assert.equal(mapSecurityLog({ ...scanLog, risk_score: risk }).risk, risk);
  }
  assert.equal(mapSecurityLog({ ...scanLog, risk_score: null, threat_score: 0.46 }).risk, 46);
  assert.equal(mapSecurityLog({ ...scanLog, risk_score: undefined, threat_score: 0 }).risk, 0);
  assert.equal(mapSecurityLog({ ...scanLog, risk_score: '', threat_score: null }).risk, null);
  assert.equal(mapSecurityLog({ ...scanLog, risk_score: NaN, threat_score: Infinity }).risk, null);
  assert.equal(mapSecurityLog({ ...scanLog, tokens_used: 0, latency_ms: 0 }).tokens, 0);
  assert.equal(mapSecurityLog({ ...scanLog, tokens_used: 0, latency_ms: 0 }).latency, '0ms');
});

test('validates required fields without inventing ids, timestamps or CLEAN status', () => {
  assert.throws(() => mapSecurityLog(null), /id/);
  assert.throws(() => mapSecurityLog({ ...scanLog, id: {} }), /id/);
  assert.throws(() => mapSecurityLog({ ...scanLog, id: '' }), /id/);
  assert.throws(() => mapSecurityLog({ ...scanLog, timestamp: 'invalid' }), /timestamp/);
  assert.throws(() => mapSecurityLog({ ...scanLog, timestamp: 42 }), /timestamp/);
  assert.throws(() => mapSecurityLog({ ...scanLog, status: undefined }), /status/);
  assert.throws(() => mapSecurityLog({ ...scanLog, status: ' ' }), /status/);
});

test('unknown statuses and threat types remain visible instead of becoming CLEAN', () => {
  const log = mapSecurityLog({ ...scanLog, status: 'requires_review', threat_type: 'policy_bypass' });
  assert.equal(log.status, 'REQUIRES_REVIEW');
  assert.equal(log.threat, 'POLICY_BYPASS');
  assert.equal(statusMatches(log, 'Clean'), false);
  assert.equal(threatMatches(log, 'All'), true);
});

test('status filters reflect backend CLEAN aliases, REDACTED and real MFA flags', () => {
  const clean = mapSecurityLog({ ...scanLog, status: 'ALLOWED' });
  assert.equal(clean.status, 'CLEAN');
  assert.equal(statusMatches(clean, 'Allowed'), true);
  assert.equal(statusMatches(clean, 'Clean'), true);
  const redacted = mapSecurityLog({ ...scanLog, status: 'REDACTED', tool_interception: { requires_2fa: true } });
  assert.equal(STATUS_FILTERS.includes('Redacted'), true);
  assert.equal(statusMatches(redacted, 'Redacted'), true);
  assert.equal(statusMatches(redacted, 'Blocked'), false);
  assert.equal(statusMatches(redacted, 'MFA Required'), true);
  assert.equal(statusMatches(mapSecurityLog({ ...scanLog, requires_2fa: true }), 'MFA Required'), true);
  assert.equal(statusMatches(mapSecurityLog({ ...scanLog, requires_2fa: 'false' }), 'MFA Required'), false);
});

test('recorded MFA and review booleans preserve unknown and prioritize true over false', () => {
  const missing = { ...scanLog, requires_2fa: undefined, review_required: undefined };
  for (const unknown of [undefined, null, 'false', 'true', 0, 1]) {
    const log = mapSecurityLog({ ...missing, requires_2fa: unknown, review_required: unknown });
    assert.equal(log.requires2fa, null);
    assert.equal(log.reviewRequired, null);
  }
  for (const [direct, nested, expected] of [
    [false, undefined, false], [undefined, false, false], [false, false, false],
    [true, false, true], [false, true, true], [undefined, true, true],
  ] as const) {
    const log = mapSecurityLog({
      ...missing,
      requires_2fa: direct,
      review_required: direct,
      tool_interception: { requires_2fa: nested },
      security_enforcement: { review_required: nested },
    });
    assert.equal(log.requires2fa, expected);
    assert.equal(log.reviewRequired, expected);
  }
});

test('multi-threat logs retain all recorded labels for grouped filters and text search', () => {
  const log = mapSecurityLog({
    ...scanLog,
    threat_types: ['prompt_injection', ' pii_exposure ', 'POLICY_BYPASS', 'NONE', null, {}, ''],
  });
  assert.deepEqual(log.threatTypes, ['PROMPT_INJECTION', 'PII_EXPOSURE', 'POLICY_BYPASS']);
  assert.equal(log.threat, 'PROMPT_INJECTION');
  assert.equal(threatMatches(log, 'Injection'), true);
  assert.equal(threatMatches(log, 'Data Leak'), true);
  assert.equal(threatMatches(log, 'Financial'), false);
  assert.equal(matchesSecurityLog(log, { ...allFilters, search: 'pii_exposure' }, now), true);
  assert.equal(matchesSecurityLog(log, { ...allFilters, search: 'policy_bypass', threatFilter: 'Data Leak' }, now), true);
  const secondaryOnly = mapSecurityLog({ ...scanLog, threat_type: 'NONE', threat_types: ['DATA_EXFILTRATION'] });
  assert.equal(secondaryOnly.threat, null);
  assert.deepEqual(secondaryOnly.threatTypes, ['DATA_EXFILTRATION']);
  assert.equal(threatMatches(secondaryOnly, 'Exfiltration'), true);
});

test('grouped filters follow real backend threat aliases while preserving the labels for display', () => {
  for (const [alias, filter] of [
    ['PII', 'Data Leak'], ['PII_EXPOSURE', 'Data Leak'], ['OUTPUT_LEAK', 'Data Leak'], ['LEAK', 'Data Leak'],
    ['POLICY_BYPASS', 'Injection'], ['JAILBREAK', 'Injection'],
    ['FINANCIAL_ACTION', 'Financial'], ['FINANCIAL_RISK', 'Financial'],
    ['SECRET_EXFILTRATION', 'Exfiltration'], ['API_KEY_THEFT', 'Tool Abuse'],
  ] as const) {
    const log = mapSecurityLog({ ...scanLog, threat_type: alias });
    assert.equal(log.threat, alias);
    assert.deepEqual(log.threatTypes, [alias]);
    assert.equal(threatMatches(log, filter), true, alias);
  }
});

test('policy names come only from recorded matches with supported historical shapes', () => {
  const log = mapSecurityLog({ ...scanLog, policy_matches: [
    { policy_name: 'Guard' }, { name: 'Review' }, { id: 17 }, 'Existing policy', { policy_name: 'Guard' }, null, {},
  ] });
  assert.deepEqual(log.policies, ['Guard', 'Review', '17', 'Existing policy']);
});

test('time filtering includes both selected bounds and excludes older or future records', () => {
  const at = (epoch: number) => mapSecurityLog({ ...scanLog, timestamp: new Date(epoch).toISOString() });
  assert.equal(matchesSecurityLog(at(now), allFilters, now), true);
  assert.equal(matchesSecurityLog(at(now - TIME_RANGES['Last 1 hour']), allFilters, now), true);
  assert.equal(matchesSecurityLog(at(now - TIME_RANGES['Last 1 hour'] - 1), allFilters, now), false);
  assert.equal(matchesSecurityLog(at(now + 1), allFilters, now), false);
  assert.equal(matchesSecurityLog(at(now - TIME_RANGES['Last 6 hours']), { ...allFilters, timeRange: 'Last 24 hours' }, now), true);
});

test('case-insensitive local search combines actual fields with status and threat filters', () => {
  const log = mapSecurityLog(scanLog);
  for (const search of ['42', 'req_backend123', '12', 'IGNORE PREVIOUS', '/api/v1/scan', 'gemini-1.5-flash', 'Prompt injection guard', log.timestamp, log.date, log.ts]) {
    assert.equal(matchesSecurityLog(log, { ...allFilters, search }, now), true, search);
  }
  assert.equal(matchesSecurityLog(log, { ...allFilters, search: 'missing' }, now), false);
  assert.equal(matchesSecurityLog(log, { ...allFilters, statusFilter: 'Clean' }, now), false);
  assert.equal(matchesSecurityLog(log, { ...allFilters, statusFilter: 'Blocked', threatFilter: 'Injection' }, now), true);
  assert.equal(matchesSecurityLog(log, { ...allFilters, threatFilter: 'Data Leak' }, now), false);
  for (const [threat, filter] of [
    ['KYC_LEAK', 'Data Leak'], ['AML_VIOLATION', 'Financial'], ['WALLET_DRAIN', 'Financial'],
    ['CREDENTIAL_THEFT', 'Tool Abuse'], ['DATA_EXFILTRATION', 'Exfiltration'], ['INDIRECT_INJECTION', 'Injection'],
  ] as const) {
    assert.equal(threatMatches(mapSecurityLog({ ...scanLog, threat_type: threat }), filter), true);
  }
});

test('merges duplicate REST and live ids, preserves highlights, sorts newest first and caps rows', () => {
  const live = mapSecurityLog(scanLog, true);
  const old = mapSecurityLog({ ...scanLog, id: 1, timestamp: '2026-09-15T08:00:00Z' });
  const newer = mapSecurityLog({ ...scanLog, id: 43, timestamp: '2026-09-15T11:00:00Z' }, true);
  const fetchedCopy = mapSecurityLog({ ...scanLog, tokens_used: 26 });
  const merged = mergeSecurityLogs([old, live], [fetchedCopy, newer, fetchedCopy], 2);
  assert.deepEqual(merged.map((log) => log.id), ['43', '42']);
  assert.equal(merged[1].tokens, 26);
  assert.equal(merged[1].isNew, true);
  assert.equal(live.tokens, 24, 'merge must not mutate existing state');
  assert.deepEqual(mergeSecurityLogs([old], [], 0), []);
});

test('default cap bounds a long live session and equal timestamps use numeric id ordering', () => {
  const logs = Array.from({ length: MAX_LOGS + 2 }, (_, index) => mapSecurityLog({ ...scanLog, id: index + 1 }));
  const merged = mergeSecurityLogs([], logs);
  assert.equal(merged.length, MAX_LOGS);
  assert.equal(merged[0].id, String(MAX_LOGS + 2));
  assert.equal(merged.at(-1)?.id, '3');
});
