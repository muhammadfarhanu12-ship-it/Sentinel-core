import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReportsQuery, summarizeThreatCounts } from '../lib/reports';

test('buildReportsQuery includes expected params', () => {
  const qs = buildReportsQuery({
    granularity: 'daily',
    days: 30,
    startTime: '2026-03-01T00:00',
    endTime: '2026-03-02T00:00',
  });
  const parsed = new URLSearchParams(qs);
  assert.equal(parsed.get('granularity'), 'daily');
  assert.equal(parsed.get('days'), '30');
  assert.ok(parsed.get('start_time'));
  assert.ok(parsed.get('end_time'));
});

test('summarizeThreatCounts totals correctly', () => {
  const totals = summarizeThreatCounts([
    { period_start: '2026-03-01T00:00:00Z', blocked: 1, redacted: 2, clean: 3, total: 6 },
    { period_start: '2026-03-02T00:00:00Z', blocked: 4, redacted: 0, clean: 1, total: 5 },
  ]);
  assert.deepEqual(totals, { blocked: 5, redacted: 2, clean: 4, total: 11 });
});

