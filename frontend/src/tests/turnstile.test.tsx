import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as AuthService from '../services/authApi';
import type { loadTurnstile, TurnstileApi } from '../services/turnstile';
import type { Turnstile as TurnstileComponent } from '../components/Turnstile';

const require = createRequire(import.meta.url);
const { StaticRouter } = require('react-router-dom') as typeof import('react-router-dom');
const bundles = new Map<string, Promise<string>>();

async function loadModule<T>(entry: string, globals: Record<string, unknown> = {}): Promise<T> {
  if (!bundles.has(entry)) {
    bundles.set(entry, build({
      absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
      entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
      external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router', 'react-router-dom'],
      define: { 'import.meta.env': JSON.stringify({ PROD: true, VITE_API_BASE_URL: 'https://backend.example' }) },
    }).then((result) => result.outputFiles[0].text));
  }
  const module = { exports: {} };
  runInNewContext(await bundles.get(entry)!, {
    module, exports: module.exports, require, console, URL, URLSearchParams, Headers,
    FormData, AbortController, DOMException, Error, setTimeout, clearTimeout, ...globals,
  });
  return module.exports as T;
}

test('widget imports and prerenders without window, document, or a secret', async () => {
  const { Turnstile } = await loadModule<{ Turnstile: typeof TurnstileComponent }>('src/components/Turnstile.tsx');
  const markup = renderToStaticMarkup(createElement(Turnstile, { action: 'contact', onToken: () => {} }));
  assert.match(markup, /Security verification/);
  assert.doesNotMatch(markup, /<script|SECRET|secret/);
  const service = await loadModule<{ loadTurnstile: typeof loadTurnstile }>('src/services/turnstile.ts');
  await assert.rejects(service.loadTurnstile(), /requires a browser/);
});

type FakeScript = {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
  removed: boolean;
};

async function createBrowser() {
  const scripts: FakeScript[] = [];
  let expire: (() => void) | undefined;
  let cleared = 0;
  const window: { turnstile?: TurnstileApi; setTimeout: Function; clearTimeout: Function } = {
    setTimeout: (callback: () => void) => { expire = callback; return 1; },
    clearTimeout: () => { cleared++; },
  };
  const document = {
    createElement: () => {
      const script: FakeScript = { src: '', onload: null, onerror: null, removed: false, remove() { this.removed = true; } };
      return script;
    },
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  };
  const service = await loadModule<{ loadTurnstile: typeof loadTurnstile }>('src/services/turnstile.ts', { window, document });
  return { service, scripts, window, expire: () => expire!(), cleared: () => cleared };
}

test('concurrent widgets load one official script and wait for API readiness', async () => {
  const browser = await createBrowser();
  const first = browser.service.loadTurnstile();
  let ready: (() => void) | undefined;
  const api: TurnstileApi = { ready: (callback) => { ready = callback; }, render: () => 'widget', remove: () => {} };
  browser.window.turnstile = api;
  browser.scripts[0].onload!();
  const second = browser.service.loadTurnstile();
  assert.equal(first, second);
  assert.equal(browser.scripts.length, 1);
  assert.equal(browser.scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  ready!();
  assert.equal(await first, api);
  assert.equal(browser.cleared(), 1);
});

for (const reason of ['network failure', 'timeout'] as const) {
  test(`script ${reason} fails closed and permits a later retry`, async () => {
    const browser = await createBrowser();
    const first = browser.service.loadTurnstile();
    const failed = assert.rejects(first, /Unable to load security verification/);
    if (reason === 'timeout') browser.expire();
    else browser.scripts[0].onerror!();
    await failed;
    assert.equal(browser.scripts[0].removed, true);

    const retry = browser.service.loadTurnstile();
    assert.equal(browser.scripts.length, 2);
    const api: TurnstileApi = { ready: (callback) => callback(), render: () => 'widget', remove: () => {} };
    browser.window.turnstile = api;
    browser.scripts[1].onload!();
    assert.equal(await retry, api);
  });
}

test('public auth requests omit CAPTCHA while preserving credentials and login session verification', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const service = await loadModule<typeof AuthService>('src/services/authApi.ts', {
    window: { location: { origin: 'https://mefyx.com' }, setTimeout, clearTimeout },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return Response.json({ data: url.endsWith('/login') ? { access_token: 'signed-access-token' } : { message: 'Success' } });
    },
  });
  await service.signupWithEmail({ email: 'ada@example.com', password: 'TestPassword123' });
  await service.signInWithEmail(' ada@example.com ', 'TestPassword123');
  await service.requestPasswordReset(' ada@example.com ');
  await service.resetPasswordWithToken('emailed-reset-token', 'NewPassword123');
  await service.resendVerificationEmail(' ada@example.com ');

  const posts = requests.filter(({ init }) => init.method === 'POST');
  assert.deepEqual(posts.map(({ url, init }) => [new URL(url).pathname, JSON.parse(String(init.body))]), [
    ['/api/v1/auth/signup', { email: 'ada@example.com', password: 'TestPassword123' }],
    ['/api/v1/auth/login', { email: 'ada@example.com', password: 'TestPassword123' }],
    ['/api/v1/auth/forgot-password', { email: 'ada@example.com' }],
    ['/api/v1/auth/reset-password', { token: 'emailed-reset-token', new_password: 'NewPassword123' }],
    ['/api/v1/auth/resend-verification', { email: 'ada@example.com' }],
  ]);
  const reset = JSON.parse(String(posts[3].init.body));
  assert.equal(reset.token, 'emailed-reset-token');
  assert.equal(reset.new_password, 'NewPassword123');
  const session = requests.find(({ init }) => init.method === 'GET')!;
  assert.equal(session.url, 'https://backend.example/api/v1/auth/me');
  assert.equal(new Headers(session.init.headers).get('Authorization'), 'Bearer signed-access-token');
});

test('invalid credentials retain the authentication error and are never automatically retried', async () => {
  let calls = 0;
  const service = await loadModule<typeof AuthService>('src/services/authApi.ts', {
    window: { location: { origin: 'https://mefyx.com' }, setTimeout, clearTimeout },
    fetch: async () => {
      calls++;
      return Response.json({ detail: 'Invalid email or password.' }, { status: 401 });
    },
  });
  await assert.rejects(service.signInWithEmail('ada@example.com', 'TestPassword123'), /Invalid email or password/);
  assert.equal(calls, 1);
});

for (const [page, location] of [
  ['SignIn', '/signin'],
  ['SignUp', '/signup'],
  ['ForgotPassword', '/forgot-password'],
  ['ResetPassword', '/reset-password?token=emailed-reset-token'],
]) {
  test(`${page} renders an enabled submit button without a CAPTCHA widget`, async () => {
    const { default: Page } = await loadModule<{ default: typeof import('../pages/Contact').default }>(`src/pages/auth/${page}.tsx`);
    const markup = renderToStaticMarkup(createElement(StaticRouter, { location }, createElement(Page)));
    assert.doesNotMatch(markup, /Security verification|turnstile|challenges\.cloudflare\.com/i);
    const submit = markup.match(/<button\b[^>]*\btype="submit"[^>]*>/)?.[0];
    assert.ok(submit, 'The authentication form must retain its submit button.');
    assert.doesNotMatch(submit, /\bdisabled(?:=|\s|>)/);
  });
}

test('Contact retains its CAPTCHA widget and blocks submission before verification', async () => {
  const { default: Contact } = await loadModule<{ default: typeof import('../pages/Contact').default }>('src/pages/Contact.tsx');
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: '/contact' }, createElement(Contact)));
  assert.match(markup, /aria-label="Security verification"/);
  const submit = markup.match(/<button\b[^>]*\btype="submit"[^>]*>/)?.[0];
  assert.ok(submit, 'The contact form must retain its submit button.');
  assert.match(submit, /\bdisabled(?:=|\s|>)/);
});
