import { useEffect, useRef, useState } from 'react';
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile';

const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

export function Turnstile({ action, onToken, resetKey = 0 }: {
  action: string;
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const displayedMessage = SITE_KEY ? message : 'Security verification is unavailable. Please try again later.';

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    let api: TurnstileApi | undefined;
    onToken(null);
    if (!SITE_KEY) return;

    function invalidate(text: string) {
      if (cancelled) return;
      onToken(null);
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
          onToken(value);
          setMessage(null);
        },
        'expired-callback': () => invalidate('Security verification expired. Please verify again.'),
        'timeout-callback': () => invalidate('Security verification timed out. Please retry.'),
        'error-callback': () => invalidate('Security verification failed. Please retry.'),
      });
    }).catch(() => invalidate('Unable to load security verification. Please check your connection and retry.'));

    return () => {
      cancelled = true;
      onToken(null);
      if (api && widgetId !== undefined) api.remove(widgetId);
    };
  }, [action, resetKey, attempt, onToken]);

  return (
    <div style={{ minWidth: 0 }} aria-label="Security verification">
      <div ref={container} />
      {displayedMessage && (
        <div className="admin-alert admin-alert--error" style={{ marginTop: 8, display: 'block' }} role="alert">
          <p>{displayedMessage}</p>
          {SITE_KEY && (
            <button type="button" className="admin-button admin-button--ghost" style={{ marginTop: 8 }} onClick={() => {
              onToken(null);
              setMessage(null);
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
