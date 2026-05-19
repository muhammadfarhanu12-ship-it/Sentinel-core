import axios from 'axios';

import { clearAdminToken, getAdminToken } from './auth';

const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8000';
const API_PREFIX = '/api/v1';
const ADMIN_API_PREFIX = `${API_PREFIX}/admin`;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sanitizeConfiguredBackendUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return '';
  }

  try {
    const parsed = new URL(normalizedValue);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return '';
    }
    return stripTrailingSlash(parsed.toString());
  } catch {
    return '';
  }
}

function normalizeApiBaseUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return `${DEFAULT_BACKEND_ORIGIN}${API_PREFIX}`;
  }

  if (/\/api(?:\/v\d+)?\/admin$/i.test(normalizedValue)) {
    return normalizedValue.replace(/\/admin$/i, '');
  }

  if (/\/api(?:\/v\d+)?$/i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `${normalizedValue}${API_PREFIX}`;
}

function normalizeAdminApiBaseUrl(value: string): string {
  const normalizedValue = stripTrailingSlash(value);
  if (!normalizedValue) {
    return `${DEFAULT_BACKEND_ORIGIN}${ADMIN_API_PREFIX}`;
  }

  if (/\/api(?:\/v\d+)?\/admin$/i.test(normalizedValue)) {
    return normalizedValue;
  }

  if (/\/api(?:\/v\d+)?$/i.test(normalizedValue)) {
    return `${normalizedValue}/admin`;
  }

  return `${normalizedValue}${ADMIN_API_PREFIX}`;
}

function resolveApiUrl(): string {
  const configuredApiUrl = sanitizeConfiguredBackendUrl(
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '',
  );
  return normalizeApiBaseUrl(configuredApiUrl || DEFAULT_BACKEND_ORIGIN);
}

function resolveAdminApiBaseUrl(): string {
  const configuredAdminApiUrl = sanitizeConfiguredBackendUrl(import.meta.env.VITE_ADMIN_API_BASE_URL || '');
  if (configuredAdminApiUrl) {
    return normalizeAdminApiBaseUrl(configuredAdminApiUrl);
  }

  return normalizeAdminApiBaseUrl(API_URL);
}

export const API_URL = resolveApiUrl();
export const ADMIN_API_BASE_URL = resolveAdminApiBaseUrl();

const api = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      clearAdminToken();
      window.dispatchEvent(new CustomEvent('admin:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default api;
