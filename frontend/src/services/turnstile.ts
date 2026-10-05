export type TurnstileApi = {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'dark' | 'light' | 'auto';
    size: 'flexible';
    'response-field': boolean;
    'refresh-expired': 'auto';
    callback(token: string): void;
    'expired-callback'(): void;
    'timeout-callback'(): void;
    'error-callback'(): void;
  }): string;
  remove(widgetId: string): void;
};

const SCRIPT_ID = 'mefyx-turnstile-script';
let scriptPromise: Promise<TurnstileApi> | undefined;

// Load the official script once, even with multiple widgets or React StrictMode.
// Keep this inside a function so importing/prerendering never accesses the DOM.
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Security verification requires a browser.'));
  }
  const browser = window as typeof window & { turnstile?: TurnstileApi };
  if (scriptPromise) return scriptPromise;
  if (browser.turnstile) return Promise.resolve(browser.turnstile);

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    let settled = false;
    const timeout = window.setTimeout(fail, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
    }

    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(new Error('Unable to load security verification. Please retry.'));
    }

    script.onerror = fail;
    script.onload = () => {
      const api = browser.turnstile;
      if (!api) return fail();
      api.ready(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(api);
      });
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}
