import { apiRequest, resolveBackendOrigin } from './api';

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

async function authRequest<T>(endpoint: string, init: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(AUTH_SERVICE_UNAVAILABLE_MESSAGE);
    }
    throw error;
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
  const data = await authRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  if (!data?.access_token) {
    throw new Error('Login failed');
  }

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
