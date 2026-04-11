import { buildBackendUrl, resolveBackendOrigin } from './api';

export { resolveBackendOrigin };

export function beginOAuthLogin(provider: 'google' | 'github' | 'facebook') {
  window.location.assign(buildBackendUrl(`/api/auth/${provider}/login`));
}

export type OAuthCallbackResult = {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  provider: string | null;
  error: string | null;
  message: string | null;
};

export function parseOAuthCallbackHash(hash: string): OAuthCallbackResult {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    email: params.get('email'),
    provider: params.get('provider'),
    error: params.get('error'),
    message: params.get('message'),
  };
}
