import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { ReportStatCard } from '../components/reports/ReportStatCard';

test('ReportStatCard renders title and value', () => {
  const html = renderToString(<ReportStatCard title="Blocked" value={1234} />);
  assert.ok(html.includes('Blocked'));
  assert.ok(html.includes('1,234') || html.includes('1234'));
});

