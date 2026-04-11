import { buildBackendUrl, parseApiErrorMessage, resolveBackendOrigin, unwrapApiData } from './api';

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  `Unable to reach the authentication service. Make sure FastAPI is running on ${resolveBackendOrigin()}.`;

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

const passwordPolicyChecks = [
  /[A-Z]/,
  /[a-z]/,
  /\d/,
];

async function authFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }
}

async function parseAuthResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(payload, fallbackMessage));
  }
  return unwrapApiData<T>(payload);
}

export async function signupWithEmail(payload: {
  name?: string;
  email: string;
  password: string;
}): Promise<AuthMessageResponse> {
  const response = await authFetch(buildBackendUrl('/api/auth/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Signup failed');
}

export async function signInWithEmail(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set('username', email.trim());
  body.set('password', password);

  const response = await authFetch(buildBackendUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const data = await parseAuthResponse<LoginResponse>(response, 'Login failed');
  if (!data?.access_token) {
    throw new Error('Login failed');
  }
  return data;
}

export async function resendVerificationEmail(email: string): Promise<AuthMessageResponse> {
  const response = await authFetch(buildBackendUrl('/api/auth/resend-verification'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Unable to resend verification email');
}

export async function requestPasswordReset(email: string): Promise<AuthMessageResponse> {
  const response = await authFetch(buildBackendUrl('/api/auth/forgot-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Request failed');
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<AuthMessageResponse> {
  const response = await authFetch(buildBackendUrl('/api/auth/reset-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Request failed');
}

export async function verifyEmailToken(token: string): Promise<AuthMessageResponse> {
  const verificationUrl = buildBackendUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  const response = await authFetch(verificationUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Verification failed');
}

export async function logoutFromServer(refreshToken?: string | null): Promise<AuthMessageResponse> {
  const response = await authFetch(buildBackendUrl('/api/auth/logout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });
  return parseAuthResponse<AuthMessageResponse>(response, 'Logout failed');
}

export function isEmailVerificationRequired(message: string | null | undefined): boolean {
  const normalized = String(message || '').toLowerCase();
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
