import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { useSecurityLogs } from '../hooks/useSecurityLogs';
import type { useStore } from '../stores/useStore';
import type { authedFetchJson } from '../services/authenticatedFetch';

type HookState = ReturnType<typeof useSecurityLogs>;
const frontendDirectory = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Compile the actual modules into memory so Vite configuration and browser globals
// can be supplied independently for each test, without writing generated files.
const mockModules: Record<string, string> = {
  react: 'export const { useState, useRef, useEffect, useCallback } = globalThis.harness.hooks;',
  '../services/auth': 'export const { getAccessToken, onAuthStorageChange } = globalThis.harness;',
  '../services/api': 'export const { buildBackendWebSocketUrl } = globalThis.harness;',
  '../services/authenticatedFetch': 'export const { authedFetchJson } = globalThis.harness;',
};

async function bundle(entry: string, mockServices = false): Promise<string> {
  const result = await build({
    absWorkingDir: frontendDirectory,
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: {
      'import.meta.env': JSON.stringify({ DEV: true, PROD: false, VITE_API_BASE_URL: 'https://backend.example/api/v1' }),
    },
    plugins: mockServices ? [{
      name: 'stream-test-services',
      setup(builder) {
        builder.onResolve({ filter: /^(react|\.\.\/services\/)/ }, ({ path }) =>
          mockModules[path] ? { path, namespace: 'stream-test' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'stream-test' }, ({ path }) => ({ contents: mockModules[path], loader: 'js' }));
      },
    }] : [],
  });
  return result.outputFiles[0].text;
}

const hookCode = bundle('src/hooks/useSecurityLogs.ts', true);
const storeCode = bundle('src/stores/useStore.ts');
const authenticatedFetchCode = bundle('src/services/authenticatedFetch.ts');

function evaluate<T>(code: string, globals: Record<string, unknown>): T {
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, require, console, URL, URLSearchParams,
    AbortController, DOMException, Error, process: { env: { NODE_ENV: 'test' } },
    ...globals,
  });
  return module.exports as T;
}

class Timers {
  now = Date.parse('2026-09-15T12:00:00Z');
  private nextId = 0;
  readonly pending = new Map<number, { run: () => void; delay: number; due: number; repeat: boolean }>();

  set(run: () => void, delay: number, repeat = false): number {
    const id = ++this.nextId;
    this.pending.set(id, { run, delay, due: this.now + delay, repeat });
    return id;
  }

  readonly window = {
    setTimeout: (run: () => void, delay: number) => this.set(run, delay),
    setInterval: (run: () => void, delay: number) => this.set(run, delay, true),
    clearTimeout: (id: number) => this.pending.delete(id),
    clearInterval: (id: number) => this.pending.delete(id),
    location: { origin: 'http://localhost:5173' },
  };

  async advance(milliseconds: number) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.pending].filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      this.now = timer.due;
      if (timer.repeat) timer.due += timer.delay;
      else this.pending.delete(id);
      timer.run();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  close(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

function socketClass(sockets: FakeSocket[]) {
  return class extends FakeSocket {
    constructor(url: string) { super(url); sockets.push(this); }
  };
}

type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | void };
type Request = {
  url: string;
  signal: AbortSignal;
  behavior?: { redirectOnNetworkError?: boolean };
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
};

async function createHookHarness() {
  const slots: Slot[] = [];
  const requests: Request[] = [];
  const sockets: FakeSocket[] = [];
  const authListeners = new Set<() => void>();
  const timers = new Timers();
  let token = 'test-token-1';
  let index = 0;
  let mounted = true;
  let scheduled = false;
  let state: HookState;
  let hook: typeof useSecurityLogs;
  let effects: Array<() => void> = [];
  const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
    a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

  function render() {
    index = 0;
    state = hook('Last 24 hours');
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
  }

  function scheduleRender() {
    if (!mounted || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (mounted) render(); });
  }

  // A deterministic effect runner keeps these tests focused on the hook's I/O
  // lifecycle. Rendering, layout, and React's concurrent scheduling are separate.
  const hooks = {
    useState<T>(initial: T | (() => T)): [T, (update: T | ((value: T) => T)) => void] {
      const at = index++;
      if (!slots[at]) slots[at] = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
      return [slots[at].value as T, (update) => {
        const next = typeof update === 'function' ? (update as (value: T) => T)(slots[at].value as T) : update;
        if (!Object.is(next, slots[at].value)) { slots[at].value = next; scheduleRender(); }
      }];
    },
    useRef<T>(initial: T): { current: T } {
      const at = index++;
      if (!slots[at]) slots[at] = { value: { current: initial } };
      return slots[at].value as { current: T };
    },
    useCallback<T>(callback: T, deps: readonly unknown[]): T {
      const at = index++;
      if (!sameDeps(slots[at]?.deps, deps)) slots[at] = { value: callback, deps };
      return slots[at].value as T;
    },
    useEffect(effect: () => (() => void) | void, deps: readonly unknown[]) {
      const at = index++;
      if (sameDeps(slots[at]?.deps, deps)) return;
      const cleanup = slots[at]?.cleanup;
      slots[at] = { deps, cleanup };
      effects.push(() => { cleanup?.(); slots[at].cleanup = effect(); });
    },
  };

  class ClockDate extends Date {
    constructor(value: string | number = timers.now) { super(value); }
    static now() { return timers.now; }
  }

  hook = evaluate<{ useSecurityLogs: typeof useSecurityLogs }>(await hookCode, {
    Date: ClockDate,
    window: timers.window,
    WebSocket: socketClass(sockets),
    harness: {
      hooks,
      getAccessToken: () => token,
      onAuthStorageChange: (listener: () => void) => {
        authListeners.add(listener);
        return () => authListeners.delete(listener);
      },
      buildBackendWebSocketUrl: (path: string, params: { token: string }) => `wss://backend.example${path}?token=${params.token}`,
      authedFetchJson: (url: string, { signal }: { signal: AbortSignal }, behavior?: Request['behavior']) => new Promise((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        requests.push({ url, signal, behavior, resolve: (data) => { signal.removeEventListener('abort', onAbort); resolve(data); }, reject });
      }),
    },
  }).useSecurityLogs;
  render();
  await flush();

  return {
    requests, sockets, timers, authListeners,
    get state() { return state; },
    async rotateToken(value: string) { token = value; authListeners.forEach((listener) => listener()); await flush(); },
    async unmount() {
      mounted = false;
      slots.forEach((slot) => slot?.cleanup?.());
      await flush();
    },
  };
}

const event = {
  id: 22, timestamp: '2026-09-15T11:59:00Z', status: 'BLOCKED',
  threat_type: 'PROMPT_INJECTION', risk_score: 90,
};

test('shared channels authenticate directly and ignore heartbeats without discarding real events', async () => {
  const sockets: FakeSocket[] = [];
  const timers = new Timers();
  const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`;
  const store = evaluate<{ useStore: typeof useStore }>(await storeCode, {
    window: timers.window,
    WebSocket: socketClass(sockets),
    atob,
    localStorage: { getItem: (key: string) => key === 'sentinel_access_token' ? token : null, removeItem: () => {} },
  }).useStore;
  store.getState().initSocket();
  try {
    assert.equal(sockets.length, 2);
    assert.deepEqual(sockets.map((socket) => new URL(socket.url).pathname), ['/ws/logs', '/ws/notifications']);
    for (const socket of sockets) {
      const url = new URL(socket.url);
      assert.equal(url.origin, 'wss://backend.example');
      assert.equal(url.searchParams.get('token'), token);
      socket.open();
      socket.message({ type: 'ping' });
    }
    assert.equal(store.getState().logs.length, 0);
    assert.equal(store.getState().notifications.length, 0);
    sockets[0].message(event);
    sockets[1].message({ id: 99, user_id: 'user-1', type: 'ALERT', message: 'Real notification' });
    assert.equal(store.getState().logs[0].id, '22');
    assert.equal(store.getState().notifications[0].id, '99');
  } finally {
    store.getState().disconnectRealtime();
  }
  assert.ok(sockets.every((socket) => socket.readyState === 3));
  assert.equal(timers.pending.size, 0);
});

test('initial fetch failure exposes retry and opens a stream only after successful data loading', async (t) => {
  const harness = await createHookHarness();
  t.after(() => harness.unmount());
  assert.equal(harness.state.loading, true);
  assert.equal(harness.sockets.length, 0);
  const target = new URL(harness.requests[0].url, 'https://backend.example');
  assert.equal(target.pathname, '/api/v1/logs');
  assert.equal(target.searchParams.get('limit'), '1000');
  assert.equal(target.searchParams.get('offset'), '0');
  assert.equal(target.searchParams.get('start_time'), '2026-09-14T12:00:00.000Z');
  assert.equal(harness.requests[0].behavior?.redirectOnNetworkError, false);
  harness.requests[0].reject(new Error('Backend unavailable'));
  await flush();
  assert.equal(harness.state.loading, false);
  assert.match(harness.state.error ?? '', /Backend unavailable/);
  assert.equal(harness.sockets.length, 0);
  harness.state.retry();
  await flush();
  harness.requests[1].resolve([event]);
  await flush();
  assert.equal(harness.state.error, null);
  assert.equal(harness.state.logs[0].id, '22');
  assert.equal(harness.sockets.length, 1);
});

test('live events survive snapshot overlap, deduplicate, and lose their temporary highlight', async (t) => {
  const harness = await createHookHarness();
  t.after(() => harness.unmount());
  harness.requests[0].resolve([]);
  await flush();
  const socket = harness.sockets[0];
  socket.open();
  await flush();
  socket.message({ type: 'ping' });
  await flush();
  assert.equal(harness.state.logs.length, 0);
  socket.message(event);
  socket.message(event);
  await flush();
  assert.equal(harness.state.logs.length, 1);
  harness.requests[1].resolve([]);
  await flush();
  assert.equal(harness.state.logs[0].id, '22');
  assert.equal(harness.state.logs[0].isNew, true);
  await harness.timers.advance(3000);
  assert.equal(harness.state.logs[0].isNew, false);
});

test('pause drops events, resume reloads missing rows, and unmount cancels pending work', async () => {
  const harness = await createHookHarness();
  try {
    harness.requests[0].resolve([event]);
    await flush();
    const socket = harness.sockets[0];
    socket.open();
    await flush();
    harness.requests[1].resolve([event]);
    await flush();
    harness.state.toggleStreaming();
    await flush();
    socket.message({ ...event, id: 23 });
    await flush();
    assert.equal(harness.state.streaming, false);
    assert.equal(socket.readyState, FakeSocket.OPEN);
    assert.equal(harness.state.logs.length, 1);
    harness.state.toggleStreaming();
    await flush();
    assert.equal(socket.readyState, 3);
    assert.equal(socket.onmessage, null);
    harness.requests[2].resolve([{ ...event, id: 23 }]);
    await flush();
    assert.equal(harness.state.logs[0].id, '23');
    harness.sockets[1].open();
    await flush();
    assert.equal(harness.requests[3].signal.aborted, false);
  } finally {
    await harness.unmount();
  }
  assert.equal(harness.requests[3].signal.aborted, true);
  assert.equal(harness.authListeners.size, 0);
  assert.equal(harness.timers.pending.size, 0);
  assert.ok(harness.sockets.every((socket) => socket.readyState === 3));
});

test('disconnect backoff is capped, authentication rejection stops retry, and token rotation reconnects', async (t) => {
  const harness = await createHookHarness();
  t.after(() => harness.unmount());
  harness.requests[0].resolve([]);
  await flush();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = harness.sockets.length;
    harness.sockets[count - 1].close(1006);
    await flush();
    assert.equal(harness.state.connection, 'reconnecting');
    await harness.timers.advance(delay - 1);
    assert.equal(harness.sockets.length, count);
    await harness.timers.advance(1);
    assert.equal(harness.sockets.length, count + 1);
  }
  harness.sockets.at(-1)!.close(1008);
  await flush();
  assert.equal(harness.state.connection, 'error');
  const rejectedCount = harness.sockets.length;
  await harness.timers.advance(30000);
  assert.equal(harness.sockets.length, rejectedCount);
  await harness.rotateToken('test-token-2');
  harness.requests.at(-1)!.resolve([]);
  await flush();
  assert.equal(new URL(harness.sockets.at(-1)!.url).searchParams.get('token'), 'test-token-2');
});

test('watchdog reconnects a stalled handshake and a socket that stops receiving heartbeats', async (t) => {
  const harness = await createHookHarness();
  t.after(() => harness.unmount());
  harness.requests[0].resolve([]);
  await flush();
  await harness.timers.advance(20000);
  assert.equal(harness.sockets[0].readyState, 3);
  assert.equal(harness.state.connection, 'reconnecting');
  await harness.timers.advance(1000);
  const socket = harness.sockets[1];
  socket.open();
  await flush();
  harness.requests[1].resolve([]);
  await flush();
  socket.message({ type: 'ping' });
  await harness.timers.advance(45000);
  assert.equal(socket.readyState, FakeSocket.OPEN);
  await harness.timers.advance(5000);
  assert.equal(socket.readyState, 3);
  assert.equal(harness.state.connection, 'reconnecting');
});

test('local network retry preserves the real stored session while 401 and default redirects remain active', async () => {
  for (const scenario of [
    { status: 503, behavior: { redirectOnNetworkError: false }, preservesSession: true },
    { status: 401, behavior: { redirectOnNetworkError: false }, preservesSession: false },
    { status: 503, behavior: undefined, preservesSession: false },
  ]) {
    const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`;
    const storage = new Map([['sentinel_access_token', token]]);
    const redirects: string[] = [];
    let authorization: string | null = null;
    const client = evaluate<{ authedFetchJson: typeof authedFetchJson }>(await authenticatedFetchCode, {
      Headers, Response, FormData, atob,
      CustomEvent: class { constructor(readonly type: string) {} },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
      window: {
        dispatchEvent: () => {},
        location: { origin: 'http://localhost:5173', pathname: '/app/logs', assign: (url: string) => redirects.push(url) },
      },
      fetch: async (_url: string, init: RequestInit) => {
        authorization = new Headers(init.headers).get('Authorization');
        if (scenario.status === 503) throw new TypeError('Network offline');
        return new Response(null, { status: scenario.status });
      },
    });
    await assert.rejects(client.authedFetchJson('/api/v1/logs', undefined, scenario.behavior), { status: scenario.status });
    assert.equal(authorization, `Bearer ${token}`);
    assert.equal(storage.has('sentinel_access_token'), scenario.preservesSession);
    assert.equal(redirects.length, scenario.preservesSession ? 0 : 1);
    if (!scenario.preservesSession) {
      assert.match(redirects[0], scenario.status === 401 ? /reason=session-expired/ : /reason=backend-connection-lost/);
    }
  }
});
