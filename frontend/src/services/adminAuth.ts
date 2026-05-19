import { buildBackendUrl } from './api';

const ADMIN_TOKEN_KEY = 'admin_token';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeToken(value: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function isTokenStructurallyValid(token: string | null): boolean {
  if (!token) return false;
  return decodeJwtPayload(token) !== null;
}

export function getAdminToken(): string | null {
  const token = normalizeToken(localStorage.getItem(ADMIN_TOKEN_KEY));
  if (isTokenStructurallyValid(token)) return token;
  if (token) localStorage.removeItem(ADMIN_TOKEN_KEY);
  return null;
}

export function setAdminToken(token: string) {
  const normalizedToken = normalizeToken(token);
  if (!isTokenStructurallyValid(normalizedToken)) {
    throw new Error('Invalid admin token received from backend.');
  }
  localStorage.setItem(ADMIN_TOKEN_KEY, normalizedToken as string);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  const normalizedToken = normalizeToken(token);
  if (!isTokenStructurallyValid(normalizedToken)) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(buildBackendUrl('/api/v1/admin/dashboard'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
        Accept: 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const payload = (await response.json().catch(() => null)) as
      | { data?: { user?: { role?: string }; role?: string } }
      | null;
    const role = String(payload?.data?.role || payload?.data?.user?.role || '').trim().toLowerCase();
    return role === 'admin';
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
