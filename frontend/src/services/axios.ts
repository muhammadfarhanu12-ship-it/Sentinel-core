export type AxiosRequestConfig = {
  baseURL?: string;
  headers?: Record<string, string>;
  timeout?: number;
  withCredentials?: boolean;
  method?: string;
  body?: unknown;
  validateStatus?: (status: number) => boolean;
  responseType?: 'json' | 'text';
};

export type AxiosResponse<T = unknown> = {
  data: T;
  status: number;
  headers: Record<string, string>;
  statusText: string;
  config: AxiosRequestConfig & { url?: string };
};

type AxiosInterceptorManager<T> = {
  use(onFulfilled: (value: T) => T | Promise<T>, onRejected?: (error: any) => any): number;
};

export type AxiosInstance = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  request<T = unknown>(config: AxiosRequestConfig & { url: string }): Promise<AxiosResponse<T>>;
  interceptors: {
    request: AxiosInterceptorManager<AxiosRequestConfig & { url?: string }>;
    response: AxiosInterceptorManager<AxiosResponse>;
  };
};

function toHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function createInterceptorManager<T>() {
  const handlers: Array<{
    onFulfilled: (value: T) => T | Promise<T>;
    onRejected?: (error: any) => any;
  }> = [];

  return {
    handlers,
    use(onFulfilled: (value: T) => T | Promise<T>, onRejected?: (error: any) => any) {
      handlers.push({ onFulfilled, onRejected });
      return handlers.length - 1;
    },
  };
}

async function runFulfilledInterceptors<T>(
  initial: T,
  handlers: Array<{
    onFulfilled: (value: T) => T | Promise<T>;
    onRejected?: (error: any) => any;
  }>,
): Promise<T> {
  let current = initial;
  for (const handler of handlers) {
    try {
      current = await handler.onFulfilled(current);
    } catch (error) {
      if (handler.onRejected) {
        current = await handler.onRejected(error);
      } else {
        throw error;
      }
    }
  }
  return current;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  inputUrl: string,
  body: unknown,
  config: AxiosRequestConfig & { url?: string },
): Promise<AxiosResponse<T>> {
  const baseURL = config.baseURL || '';
  const url = inputUrl.startsWith('http') ? inputUrl : `${baseURL}${inputUrl}`;

  const controller = new AbortController();
  const timeoutMs = typeof config.timeout === 'number' ? config.timeout : 15000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(config.headers || {}),
      },
      credentials: config.withCredentials ? 'include' : 'same-origin',
      body:
        method === 'GET' || method === 'DELETE'
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    const text = await res.text();
    const data =
      config.responseType === 'text'
        ? (text as T)
        : text
          ? (JSON.parse(text) as T)
          : (null as unknown as T);

    const response: AxiosResponse<T> = {
      data,
      status: res.status,
      headers: toHeaders(res.headers),
      statusText: res.statusText,
      config: { ...config, url: inputUrl },
    };

    const validateStatus = config.validateStatus || ((status: number) => status >= 200 && status < 300);
    if (!validateStatus(res.status)) {
      const error = new Error(`Request failed with status ${res.status}`) as Error & { response: AxiosResponse<T> };
      error.response = response;
      throw error;
    }

    return response;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const axios = {
  create(config: AxiosRequestConfig = {}): AxiosInstance {
    const requestInterceptors = createInterceptorManager<AxiosRequestConfig & { url?: string }>();
    const responseInterceptors = createInterceptorManager<AxiosResponse>();

    async function dispatch<T>(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      body?: unknown,
      cfg?: AxiosRequestConfig,
    ): Promise<AxiosResponse<T>> {
      const merged = await runFulfilledInterceptors(
        {
          ...config,
          ...(cfg || {}),
          url,
          method,
          body,
          headers: {
            ...(method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
            ...(config.headers || {}),
            ...((cfg && cfg.headers) || {}),
          },
        },
        requestInterceptors.handlers,
      );

      try {
        const response = await request<T>(method, url, body, merged);
        return await runFulfilledInterceptors(response, responseInterceptors.handlers as Array<{
          onFulfilled: (value: AxiosResponse<T>) => AxiosResponse<T> | Promise<AxiosResponse<T>>;
          onRejected?: (error: any) => any;
        }>);
      } catch (error: any) {
        const response = error?.response;
        if (response) {
          return await runFulfilledInterceptors(response as AxiosResponse<T>, responseInterceptors.handlers as Array<{
            onFulfilled: (value: AxiosResponse<T>) => AxiosResponse<T> | Promise<AxiosResponse<T>>;
            onRejected?: (error: any) => any;
          }>);
        }
        throw error;
      }
    }

    return {
      get<T>(url: string, cfg?: AxiosRequestConfig) {
        return dispatch<T>('GET', url, undefined, cfg);
      },
      post<T>(url: string, body?: unknown, cfg?: AxiosRequestConfig) {
        return dispatch<T>('POST', url, body, cfg);
      },
      patch<T>(url: string, body?: unknown, cfg?: AxiosRequestConfig) {
        return dispatch<T>('PATCH', url, body, cfg);
      },
      delete<T>(url: string, cfg?: AxiosRequestConfig) {
        return dispatch<T>('DELETE', url, undefined, cfg);
      },
      request<T>(cfg: AxiosRequestConfig & { url: string }) {
        return dispatch<T>((cfg.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PATCH' | 'DELETE', cfg.url, cfg.body, cfg);
      },
      interceptors: {
        request: requestInterceptors,
        response: responseInterceptors,
      },
    };
  },
};

export default axios;
