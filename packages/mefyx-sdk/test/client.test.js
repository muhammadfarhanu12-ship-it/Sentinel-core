import assert from 'node:assert/strict';
import test from 'node:test';
import { Mefyx, MefyxApiError } from '../index.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const success = (data) => json({ success: true, data, error: null });

test('scan uses the deployed route, API-key header, exact payload, and unwrapped result', async () => {
  const request = {
    text: 'Hello', provider: 'local', model: 'local', security_tier: 'free',
    session_id: 'session', request_id: 'request', conversation_id: 'conversation',
    conversation_history: ['Earlier message'], untrusted_content: 'Document',
    tool_call: { name: 'read_document', args: { id: 1 } }, tool_2fa_code: '123456',
    context: { source: 'document', operation: 'data_access' }, metadata: { label: 'example' },
  };
  const result = { status: 'BLOCKED', risk_score: 90, extra_analysis: { test: true } };
  let calls = 0;
  const client = new Mefyx({
    baseUrl: 'https://mefyx.example/', apiKey: 'example-key',
    fetch: async (url, init) => {
      calls += 1;
      assert.equal(url, 'https://mefyx.example/api/v1/scan');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['X-API-Key'], 'example-key');
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(init.body), request);
      return success(result);
    },
  });
  assert.deepEqual(await client.scan(request), result);
  assert.equal(calls, 1);
});

test('gateway uses bearer auth, exact request fields, and gateway response data', async () => {
  const request = {
    provider: 'gemini', model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Hello' }], temperature: 0.5, max_tokens: 256,
    metadata: { label: 'example' }, project: 'project-label', app_name: 'test',
  };
  const result = {
    provider: 'gemini', model: 'gemini-2.5-flash', content: 'Hello', request_id: 'request-1',
    usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, estimated_cost: 0, estimated: true },
    security: { decision: 'allow', risk_score: 0, threat_type: 'NONE', matched_policies: [], status: 'CLEAN', requires_2fa: false, review_required: false },
  };
  const controller = new AbortController();
  const client = new Mefyx({
    baseUrl: 'http://localhost:8000', bearerToken: 'example-token',
    fetch: async (url, init) => {
      assert.equal(url, 'http://localhost:8000/api/v1/gateway/chat');
      assert.equal(init.headers.Authorization, 'Bearer example-token');
      assert.equal(init.headers['X-API-Key'], undefined);
      assert.equal(init.signal, controller.signal);
      assert.deepEqual(JSON.parse(init.body), request);
      return success(result);
    },
  });
  assert.deepEqual(await client.chat(request, { signal: controller.signal }), result);
});

test('omitted provider, model, security tier, and auth remain omitted', async () => {
  const client = new Mefyx({
    baseUrl: 'https://mefyx.example',
    fetch: async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { prompt: 'Hello' });
      assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
      return success({ status: 'CLEAN' });
    },
  });
  await client.scan({ prompt: 'Hello' });
  await client.chat({ prompt: 'Hello' });
});

test('gateway policy errors preserve status, code, security details, and full body', async () => {
  const body = { success: false, data: null, error: {
    code: 'policy_blocked', message: 'Request blocked by Mefyx policy.',
    details: { request_id: 'request-2', security: { status: 'BLOCKED', risk_score: 99 } },
    request_id: 'request-2',
  } };
  const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => json(body, 403) });
  await assert.rejects(client.chat({ prompt: 'Hello' }), (error) => {
    assert.ok(error instanceof MefyxApiError);
    assert.equal(error.name, 'MefyxApiError');
    assert.equal(error.message, body.error.message);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'policy_blocked');
    assert.deepEqual(error.details, body.error.details);
    assert.deepEqual(error.body, body);
    return true;
  });
});

test('failed envelopes throw even when HTTP succeeds, with no retry', async () => {
  let calls = 0;
  const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => {
    calls += 1;
    return json({ success: false, error: { code: 'scan_error', message: 'Scan failed', details: ['reason'] } });
  } });
  await assert.rejects(client.scan({ prompt: 'Hello' }), { status: 200, code: 'scan_error', details: ['reason'] });
  assert.equal(calls, 1);
});

test('HTTP errors cannot be hidden by a successful envelope', async () => {
  const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => json({ success: true, data: {} }, 500) });
  await assert.rejects(client.scan({ prompt: 'Hello' }), { status: 500, code: 'http_error' });
});

test('FastAPI string and validation details remain available', async (t) => {
  for (const detail of ['Not authenticated', { message: 'Quota exceeded', limit: 1000 }, [{ loc: ['body', 'prompt'], msg: 'Required' }]]) {
    await t.test(JSON.stringify(detail), async () => {
      const body = { detail };
      const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => json(body, 422) });
      await assert.rejects(client.scan({ prompt: 'Hello' }), (error) => {
        assert.ok(error instanceof MefyxApiError);
        assert.equal(error.status, 422);
        assert.deepEqual(error.details, detail);
        assert.deepEqual(error.body, body);
        return true;
      });
    });
  }
});

test('non-JSON HTTP error bodies are preserved without leaking parser errors', async () => {
  const body = '<html>Service unavailable</html>';
  const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => new Response(body, { status: 503 }) });
  await assert.rejects(client.scan({ prompt: 'Hello' }), { status: 503, code: 'http_error', body });
});

test('malformed successful responses are rejected', async (t) => {
  for (const body of ['not json', '', 'null', '[]', '{}', '{"success":true}', '{"success":true,"data":null}', '{"success":true,"data":[]}']) {
    await t.test(body || 'empty body', async () => {
      const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async () => new Response(body) });
      await assert.rejects(client.scan({ prompt: 'Hello' }), { status: 200, code: 'invalid_response' });
    });
  }
});

test('network and abort errors pass through once, and scan forwards its signal', async () => {
  const controller = new AbortController();
  controller.abort();
  for (const expected of [new TypeError('Network unavailable'), controller.signal.reason]) {
    let calls = 0;
    const client = new Mefyx({ baseUrl: 'https://mefyx.example', fetch: async (_url, init) => {
      calls += 1;
      assert.equal(init.signal, controller.signal);
      throw expected;
    } });
    await assert.rejects(client.scan({ prompt: 'Hello' }, { signal: controller.signal }), (error) => error === expected);
    assert.equal(calls, 1);
  }
});

test('constructor requires a deployment origin and unambiguous credentials', () => {
  assert.throws(() => new Mefyx(), TypeError);
  for (const baseUrl of ['', '/api', 'ftp://example.com', 'https://example.com/api', 'https://example.com?query=1', 'https://example.com/#fragment', 'https://user:secret@example.com']) {
    assert.throws(() => new Mefyx({ baseUrl }), TypeError);
  }
  assert.throws(() => new Mefyx({ baseUrl: 'https://example.com', apiKey: 'key', bearerToken: 'token' }), TypeError);
  assert.throws(() => new Mefyx({ baseUrl: 'https://example.com', apiKey: ' ' }), TypeError);
  assert.throws(() => new Mefyx({ baseUrl: 'https://example.com', bearerToken: '' }), TypeError);
  assert.throws(() => new Mefyx({ baseUrl: 'https://example.com', fetch: null }), TypeError);
});
