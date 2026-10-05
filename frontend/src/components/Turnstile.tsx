import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTurnstile, type TurnstileApi } from '../services/turnstile';

const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const COMPLETE_MESSAGE = 'Please complete the security verification and try again.';

export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const availableToken = useRef<string | null>(null);
  const onToken = useCallback((value: string | null) => {
    availableToken.current = value;
    setToken(value);
  }, []);
  const reset = useCallback(() => {
    onToken(null);
    setResetKey((value) => value + 1);
  }, [onToken]);
  const consumeToken = useCallback(() => {
    const value = availableToken.current;
    if (!value) throw new Error(COMPLETE_MESSAGE);
    // Tokens are single-use. Invalidate synchronously to prevent double submits.
    onToken(null);
    return value;
  }, [onToken]);

  return { token, consumeToken, reset, widgetProps: { onToken, resetKey } };
}

export function Turnstile({ action, onToken, resetKey = 0 }: {
  action: string;
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    let api: TurnstileApi | undefined;
    callback.current?.(null);
    setMessage(null);
    if (!SITE_KEY) {
      setMessage('Security verification is unavailable. Please try again later.');
      return;
    }

    function invalidate(text: string) {
      if (cancelled) return;
      callback.current?.(null);
      setMessage(text);
    }

    void loadTurnstile().then((loadedApi) => {
      if (cancelled || !container.current) return;
      api = loadedApi;
      widgetId = api.render(container.current, {
        sitekey: SITE_KEY,
        action,
        theme: 'dark',
        size: 'flexible',
        'response-field': false,
        'refresh-expired': 'auto',
        callback: (value) => {
          if (cancelled) return;
          callback.current?.(value);
          setMessage(null);
        },
        'expired-callback': () => invalidate('Security verification expired. Please verify again.'),
        'timeout-callback': () => invalidate('Security verification timed out. Please retry.'),
        'error-callback': () => invalidate('Security verification failed. Please retry.'),
      });
    }).catch(() => invalidate('Unable to load security verification. Please check your connection and retry.'));

    return () => {
      cancelled = true;
      callback.current?.(null);
      if (api && widgetId !== undefined) api.remove(widgetId);
    };
  }, [action, resetKey, attempt]);

  return (
    <div className="my-4 min-w-0" aria-label="Security verification">
      <div ref={container} />
      {message && (
        <div className="mt-2 text-sm text-red-300" role="alert">
          <p>{message}</p>
          {SITE_KEY && (
            <button type="button" className="mt-2 underline underline-offset-2" onClick={() => {
              callback.current?.(null);
              setAttempt((value) => value + 1);
            }}>
              Retry verification
            </button>
          )}
        </div>
      )}
    </div>
  );
}
