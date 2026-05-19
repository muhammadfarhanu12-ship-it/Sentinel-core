export const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_AUTH_STORAGE_EVENT = 'sentinel-admin:auth-storage-updated';

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

function emitAdminAuthStorageUpdate(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_STORAGE_EVENT));
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
  emitAdminAuthStorageUpdate();
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  emitAdminAuthStorageUpdate();
}

export function hasStoredAdminSession(): boolean {
  return Boolean(getAdminToken());
}

export function isAdminAuthenticated() {
  return hasStoredAdminSession();
}

export function onAdminAuthStorageChange(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key && event.key !== ADMIN_TOKEN_KEY) return;
    handler();
  };
  const onCustom = () => handler();

  window.addEventListener('storage', onStorage);
  window.addEventListener(ADMIN_AUTH_STORAGE_EVENT, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ADMIN_AUTH_STORAGE_EVENT, onCustom);
  };
}
