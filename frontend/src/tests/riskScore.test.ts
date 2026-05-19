import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRiskLevel, normalizeRiskScore, normalizeVerdict } from '../lib/riskScore';

test('normalizeRiskScore uses threat_score when risk_score is missing', () => {
  assert.equal(normalizeRiskScore({ threat_score: 0.9 }), 90);
});

test('normalizeRiskScore uses threat_score when risk_score is stale zero', () => {
  assert.equal(normalizeRiskScore({ risk_score: 0, threat_score: 0.9 }), 90);
});

test('normalizeRiskScore keeps 0-100 scores unchanged', () => {
  assert.equal(normalizeRiskScore({ risk_score: 90 }), 90);
});

test('normalizeRiskScore supports riskScore and threatScore aliases', () => {
  assert.equal(normalizeRiskScore({ riskScore: 71 }), 71);
  assert.equal(normalizeRiskScore({ threatScore: 0.46 }), 46);
});

test('normalizeRiskLevel derives level when missing', () => {
  assert.equal(normalizeRiskLevel(undefined, 20), 'low');
  assert.equal(normalizeRiskLevel(undefined, 21), 'medium');
  assert.equal(normalizeRiskLevel(undefined, 46), 'high');
  assert.equal(normalizeRiskLevel(undefined, 71), 'critical');
});

test('normalizeVerdict maps common backend statuses', () => {
  assert.equal(normalizeVerdict('block'), 'BLOCKED');
  assert.equal(normalizeVerdict('allowed'), 'ALLOWED');
  assert.equal(normalizeVerdict('requires_review'), 'REVIEW REQUIRED');
  assert.equal(normalizeVerdict('warn'), 'WARNING');
});
