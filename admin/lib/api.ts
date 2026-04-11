import axios from 'axios';

import { clearAdminToken, getAdminToken } from './auth';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveAdminApiBaseUrl(): string {
  const configuredBaseUrl = stripTrailingSlash(import.meta.env.VITE_ADMIN_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '');
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const hostname = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  return `http://${hostname}:8000/api/v1/admin`;
}

const api = axios.create({
  baseURL: resolveAdminApiBaseUrl(),
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
