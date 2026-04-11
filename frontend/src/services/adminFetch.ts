import adminApi from './adminApi';
import { clearAdminToken } from './adminAuth';

export class AdminHttpError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = 'AdminHttpError';
    this.status = status;
    this.payload = payload;
  }
}

function unwrapEnvelope<T>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data as T;
  return payload as T;
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  try {
    const response = await adminApi.request<string>({
      url,
      method: init?.method || 'GET',
      body: init?.body,
      headers: Object.fromEntries(headers.entries()),
      responseType: 'text',
      validateStatus: () => true,
    });

    if (response.status === 401) {
      clearAdminToken();
    }

    return new Response(response.data, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error: any) {
    if (error?.response?.status === 401) clearAdminToken();
    throw error;
  }
}

export async function adminFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await adminFetch(input, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.detail ||
      payload?.message ||
      `Admin request failed with status ${response.status}`;
    throw new AdminHttpError(String(message), response.status, payload);
  }
  return unwrapEnvelope<T>(payload);
}
