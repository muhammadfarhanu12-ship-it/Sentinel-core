const ACCESS_TOKEN_KEY = "sentinel_access_token";
const REFRESH_TOKEN_KEY = "sentinel_refresh_token";
const DISPLAY_NAME_KEY = "sentinel_display_name";
const AUTH_STORAGE_EVENT = "sentinel:auth-storage-updated";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeStoredToken(value: string | null): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isTokenStructurallyValid(token: string | null): boolean {
  if (!token) return false;
  return decodeJwtPayload(token) !== null;
}

function emitAuthStorageUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_STORAGE_EVENT));
}

export function getAccessToken(): string | null {
  const token = normalizeStoredToken(localStorage.getItem(ACCESS_TOKEN_KEY));
  if (isTokenStructurallyValid(token)) return token;
  if (token) localStorage.removeItem(ACCESS_TOKEN_KEY);
  return null;
}

export function getRefreshToken(): string | null {
  const token = normalizeStoredToken(localStorage.getItem(REFRESH_TOKEN_KEY));
  if (isTokenStructurallyValid(token)) return token;
  if (token) localStorage.removeItem(REFRESH_TOKEN_KEY);
  return null;
}

export function hasStoredSession(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}

export function isAccessTokenExpired(skewSeconds = 30): boolean {
  const token = getAccessToken();
  if (!token) return true;

  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return true;

  return exp * 1000 <= Date.now() + skewSeconds * 1000;
}

export function setTokens(accessToken: string, refreshToken?: string) {
  const normalizedAccessToken = normalizeStoredToken(accessToken);
  if (!isTokenStructurallyValid(normalizedAccessToken)) {
    throw new Error("Invalid access token received from server.");
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, normalizedAccessToken as string);

  if (refreshToken !== undefined) {
    const normalizedRefreshToken = normalizeStoredToken(refreshToken);
    if (isTokenStructurallyValid(normalizedRefreshToken)) {
      localStorage.setItem(REFRESH_TOKEN_KEY, normalizedRefreshToken as string);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }
  emitAuthStorageUpdate();
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(DISPLAY_NAME_KEY);
  emitAuthStorageUpdate();
}

export function getDisplayName(): string | null {
  return localStorage.getItem(DISPLAY_NAME_KEY);
}

export function setDisplayName(name: string) {
  localStorage.setItem(DISPLAY_NAME_KEY, name);
}

export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function onAuthStorageChange(handler: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key && event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) return;
    handler();
  };
  const onCustom = () => handler();

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_STORAGE_EVENT, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_STORAGE_EVENT, onCustom);
  };
}
