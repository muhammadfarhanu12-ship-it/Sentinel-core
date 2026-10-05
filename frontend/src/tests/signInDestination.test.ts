import assert from 'node:assert/strict';
import test from 'node:test';
import { getSignInDestination } from '../lib/signInDestination';

test('sign-in resumes the protected Security Test Lab page', () => {
  assert.equal(getSignInDestination({ from: { pathname: '/app/playground' } }), '/app/playground');
  assert.equal(getSignInDestination({ from: { pathname: '/app/api-keys' } }), '/app/api-keys');
});

test('sign-in defaults to the dashboard without a valid return page', () => {
  for (const state of [null, undefined, {}, { from: null }, { from: 'https://example.com' }, { from: { pathname: 42 } }]) {
    assert.equal(getSignInDestination(state), '/app');
  }
});

test('sign-in rejects external URLs and paths outside the protected app', () => {
  for (const pathname of [
    'https://example.com/app',
    '//example.com/app',
    '/signin',
    '/application',
    '/app/../../signin',
    '/app/%2e%2e/signin',
    '/app/\\example.com',
    '/app/playground?next=https://example.com',
  ]) {
    assert.equal(getSignInDestination({ from: { pathname } }), '/app');
  }
});
