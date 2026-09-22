import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { RemediationActionBadge } from '../components/reports/RemediationActionBadge';
import { normalizeRemediationActions, remediationActionTrace } from '../lib/remediationActions';

test('recorded outcomes remain distinct even when legacy complete flags contradict them', () => {
  const actions = normalizeRemediationActions([
    { type: 'QUARANTINE_REQUEST', status: 'SUCCESS' },
    { type: 'ALERT_EMAIL', status: 'FAILED', complete: true, details: 'Email provider rejected the message.' },
    { type: 'ALERT_EMAIL', status: 'SKIPPED', complete: true, reason: 'FREE_TIER' },
  ]);

  assert.deepEqual(actions.map((action) => action.status), ['SUCCESS', 'FAILED', 'SKIPPED']);
  assert.match(remediationActionTrace(actions[1]).message, /Failed.*provider rejected/);
  assert.equal(remediationActionTrace(actions[1]).level, 'error');
  assert.match(remediationActionTrace(actions[2]).message, /Skipped.*free tier/);
  assert.equal(remediationActionTrace(actions[2]).level, 'info');
});

test('missing or unrecognized action status never becomes success', () => {
  const actions = normalizeRemediationActions([
    'ALERT_EMAIL',
    { type: 'ALERT_EMAIL' },
    { type: 'ALERT_EMAIL', complete: true },
    { type: 'ALERT_EMAIL', status: 'PENDING' },
    { type: 'ALERT_EMAIL', status: 'UNKNOWN', details: 'Historical delivery was not verified.' },
    null,
  ]);

  assert.ok(actions.every((action) => action.status === 'UNKNOWN'));
  assert.ok(actions.every((action) => remediationActionTrace(action).level === 'warn'));
  assert.equal(actions[4].details, 'Historical delivery was not verified.');
  assert.deepEqual(normalizeRemediationActions(undefined), []);
});

for (const { status, label, color, icon } of [
  { status: 'SUCCESS', label: 'Success', color: 'emerald', icon: 'circle-check' },
  { status: 'FAILED', label: 'Failed', color: 'red', icon: 'circle-x' },
  { status: 'SKIPPED', label: 'Skipped', color: 'amber', icon: 'skip-forward' },
  { status: 'UNKNOWN', label: 'Unverified', color: 'slate', icon: 'circle-question-mark' },
]) {
  test(`email ${status} displays a distinct label, icon, color, and explanation`, () => {
    const [action] = normalizeRemediationActions([{ type: 'ALERT_EMAIL', status, details: 'Recorded delivery explanation.' }]);
    const html = renderToString(<RemediationActionBadge action={action} showDetails />).replace(/<!--.*?-->/g, '');

    assert.ok(html.includes(`Email alert: ${label}`));
    assert.ok(html.includes(`text-${color}-`));
    assert.ok(html.includes(`lucide-${icon}`));
    assert.ok(html.includes('Recorded delivery explanation.</span>'));
    assert.ok(!html.includes('Email sent'));
    if (status !== 'SUCCESS') assert.ok(!html.includes('text-emerald-'));
  });
}
