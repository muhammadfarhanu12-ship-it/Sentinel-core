import axios from 'axios';

import { clearAdminToken, getAdminToken } from './auth';

const DEFAULT_API_URL = 'https://sentinel-core-xcrz.onrender.com';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  return stripTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_API_URL);
}

export const API_URL = resolveApiUrl();
export const ADMIN_API_BASE_URL = `${API_URL}/api/v1/admin`;

const api = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  withCredentials: true,
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
