import axios from 'axios';

import { clearAdminToken, getAdminToken } from './adminAuth';
import { resolveAdminApiBaseUrl } from './api';

const adminApi = axios.create({
  baseURL: resolveAdminApiBaseUrl(),
  withCredentials: true,
  timeout: 15000,
});

adminApi.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAdminToken();
    }
    throw error;
  },
);

export default adminApi;
