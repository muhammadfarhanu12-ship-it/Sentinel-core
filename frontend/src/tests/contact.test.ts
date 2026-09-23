import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { ContactSubmission, submitContact } from '../services/contact';

// Exercise the real public HTTP helper with Vite's environment supplied in memory.
const serviceCode = build({
  absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
  entryPoints: ['src/services/contact.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  define: {
    'import.meta.env': JSON.stringify({ PROD: true, VITE_API_BASE_URL: 'https://backend.example/api/v1' }),
  },
}).then((result) => result.outputFiles[0].text);

async function loadService(fetch: typeof globalThis.fetch, globals: Record<string, unknown> = {}) {
  const module = { exports: {} };
  runInNewContext(await serviceCode, {
    module, exports: module.exports, console, URL, URLSearchParams, Headers, FormData,
    AbortController, DOMException, Error, setTimeout, clearTimeout, fetch, ...globals,
  });
  return module.exports as { submitContact: typeof submitContact };
}

const submission: ContactSubmission = {
  firstName: ' Ada ',
  lastName: ' Lovelace ',
  email: ' ada@example.com ',
  company: ' Example Ltd ',
  message: ' Please help secure our AI app. ',
};

test('contact sends all trimmed fields to the configured backend without login credentials', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const service = await loadService(async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return Response.json({ success: true, data: { message: 'Message sent.' } });
  });

  await service.submitContact(submission);

  assert.equal(requests.length, 1);
  const [{ url, init }] = requests;
  assert.equal(url, 'https://backend.example/api/v1/contact');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(new Headers(init.headers).has('Authorization'), false);
  assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(init.body)), {
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
    company: 'Example Ltd', message: 'Please help secure our AI app.',
  });
});

test('company is optional and blank required fields never make a request', async () => {
  let requests = 0;
  const service = await loadService(async (_url, init) => {
    requests++;
    assert.equal(JSON.parse(String(init?.body)).company, '');
    return Response.json({ success: true, data: { message: 'Message sent.' } });
  });

  await service.submitContact({ ...submission, company: undefined });
  for (const field of ['firstName', 'lastName', 'email', 'message']) {
    await assert.rejects(service.submitContact({ ...submission, [field]: '  ' }), /Please enter/);
  }
  assert.equal(requests, 1);
});

for (const { status, expected } of [
  { status: 429, expected: /Too many messages.*15 minutes/ },
  { status: 422, expected: /Please check your name, email, company, and message/ },
  { status: 503, expected: /couldn't send your message.*support@mefyx.com/ },
]) {
  test(`contact reports a useful error for HTTP ${status} without automatically resending`, async () => {
    let requests = 0;
    const service = await loadService(async () => {
      requests++;
      return Response.json({ detail: 'Internal provider details must not be displayed.' }, { status });
    });

    await assert.rejects(service.submitContact(submission), expected);
    assert.equal(requests, 1);
  });
}

test('contact reports network failures and clears its timeout', async () => {
  let cleared = false;
  const service = await loadService(async () => { throw new TypeError('Failed to fetch'); }, {
    setTimeout: () => 1,
    clearTimeout: () => { cleared = true; },
  });

  await assert.rejects(service.submitContact(submission), /couldn't send your message/);
  assert.equal(cleared, true);
});

test('contact aborts a stalled request after 30 seconds and reports failure', async () => {
  let expire: (() => void) | undefined;
  let timeout: number | undefined;
  let cleared = false;
  const service = await loadService((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }), {
    setTimeout: (callback: () => void, milliseconds: number) => { expire = callback; timeout = milliseconds; return 1; },
    clearTimeout: () => { cleared = true; },
  });

  const pending = service.submitContact(submission);
  const failure = assert.rejects(pending, /couldn't send your message/);
  assert.equal(timeout, 30000);
  expire!();
  await failure;
  assert.equal(cleared, true);
});
