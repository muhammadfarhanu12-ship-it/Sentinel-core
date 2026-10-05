import { useCallback, useRef, useState } from 'react';

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
    if (!value) throw new Error('Please complete the security verification and try again.');
    // Tokens are single-use. Invalidate synchronously to prevent double submits.
    onToken(null);
    return value;
  }, [onToken]);

  return { token, consumeToken, reset, widgetProps: { onToken, resetKey } };
}
