import { ApiRequestError, apiRequest, resolveBackendOrigin } from './api';

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  'Server unavailable. Please check your backend connection and try again.';
export const AUTH_INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials. Please check your email and password.';
export const AUTH_FAILED_MESSAGE = 'Authentication failed. Please try again.';

export const PASSWORD_POLICY_HINT =
  'Use 12+ characters with at least one uppercase letter, one lowercase letter, and one number.';

export type AuthMessageResponse = {
  message?: string;
  email?: string;
  email_sent?: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  is_verified: boolean;
};

export type LoginResponse = {
  access_token: string;
  refresh_token?: string | null;
  token_type: string;
  user?: AuthUser | null;
};

export type AuthErrorCode =
  | 'server-unavailable'
  | 'invalid-credentials'
  | 'forbidden'
  | 'authentication-failed';

export class AuthApiError extends Error {
  code: AuthErrorCode;
  status?: number;

  constructor(message: string, code: AuthErrorCode, status?: number) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
  }
}

const passwordPolicyChecks = [
  /[A-Z]/,
  /[a-z]/,
  /\d/,
];

function isAuthServiceUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  let backendOrigin = '';
  try {
    backendOrigin = resolveBackendOrigin().toLowerCase();
  } catch {
    backendOrigin = '';
  }
  return (
    normalizedMessage.includes('server unavailable') ||
    normalizedMessage.includes('vite_api_base_url') ||
    normalizedMessage.includes('unable to reach') ||
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('cors') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('timed out') ||
    Boolean(backendOrigin && normalizedMessage.includes(backendOrigin))
  );
}

function toAuthApiError(error: unknown): AuthApiError {
  if (error instanceof AuthApiError) {
    return error;
  }

  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return new AuthApiError(AUTH_INVALID_CREDENTIALS_MESSAGE, 'invalid-credentials', error.status);
    }

    if (error.status === 404) {
      return new AuthApiError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 'server-unavailable', error.status);
    }

    if (error.status === 403) {
      const message = String(error.message || '');
      if (isEmailVerificationRequired(message)) {
        return new AuthApiError(message, 'forbidden', error.status);
      }
      return new AuthApiError(AUTH_INVALID_CREDENTIALS_MESSAGE, 'invalid-credentials', error.status);
    }

    if (error.status >= 500 || error.status === 502 || error.status === 503 || error.status === 504) {
      return new AuthApiError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 'server-unavailable', error.status);
    }

    return new AuthApiError(String(error.message || AUTH_FAILED_MESSAGE), 'authentication-failed', error.status);
  }

  if (error instanceof TypeError || isAuthServiceUnavailable(error)) {
    return new AuthApiError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 'server-unavailable');
  }

  if (error instanceof Error && error.message.trim()) {
    return new AuthApiError(error.message, 'authentication-failed');
  }

  return new AuthApiError(AUTH_FAILED_MESSAGE, 'authentication-failed');
}

async function authRequest<T>(endpoint: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    return await apiRequest<T>(endpoint, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } catch (error) {
    throw toAuthApiError(error);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function assertBackendHealthyForAuthentication(): Promise<void> {
  try {
    const health = await authRequest<{ status?: string }>('/api/v1/health', {
      method: 'GET',
      cache: 'no-store',
    });
    if (String(health?.status || '').toLowerCase() !== 'ok') {
      throw new AuthApiError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 'server-unavailable', 503);
    }
  } catch (error) {
    throw toAuthApiError(error);
  }
}

export async function verifyBackendSession(accessToken: string): Promise<AuthUser> {
  const normalizedAccessToken = String(accessToken || '').trim();
  if (!normalizedAccessToken) {
    throw new AuthApiError(AUTH_FAILED_MESSAGE, 'authentication-failed');
  }

  try {
    return await authRequest<AuthUser>('/api/v1/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalizedAccessToken}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    const mappedError = toAuthApiError(error);
    if (mappedError.code === 'server-unavailable') {
      throw mappedError;
    }
    throw new AuthApiError(AUTH_FAILED_MESSAGE, 'authentication-failed', mappedError.status);
  }
}

export async function signupWithEmail(payload: {
  name?: string;
  email: string;
  password: string;
}): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>('/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function signInWithEmail(email: string, password: string): Promise<LoginResponse> {
  await assertBackendHealthyForAuthentication();

  let data: LoginResponse;
  try {
    data = await authRequest<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      throw new AuthApiError(AUTH_INVALID_CREDENTIALS_MESSAGE, 'invalid-credentials', 404);
    }
    throw error;
  }

  if (!data?.access_token) {
    throw new AuthApiError(AUTH_FAILED_MESSAGE, 'authentication-failed');
  }

  await verifyBackendSession(String(data.access_token));
  return data;
}

export async function resendVerificationEmail(email: string): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>('/api/v1/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function requestPasswordReset(email: string): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>('/api/v1/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function verifyEmailToken(token: string): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
  });
}

export async function logoutFromServer(refreshToken?: string | null): Promise<AuthMessageResponse> {
  return authRequest<AuthMessageResponse>('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });
}

export function isEmailVerificationRequired(message: string | null | undefined): boolean {
  const normalized = message?.toLowerCase() || '';
  return normalized.includes('not verified') || normalized.includes('verify your email');
}

export function getPasswordPolicyError(password: string): string | null {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    return 'Password is required.';
  }
  if (normalizedPassword.length < 12) {
    return PASSWORD_POLICY_HINT;
  }
  if (!passwordPolicyChecks.every((pattern) => pattern.test(normalizedPassword))) {
    return PASSWORD_POLICY_HINT;
  }
  return null;
}
