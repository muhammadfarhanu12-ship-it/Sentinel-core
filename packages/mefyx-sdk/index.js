const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** An HTTP, API-envelope, or invalid-response error. Transport errors pass through. */
export class MefyxApiError extends Error {
  constructor(message, { status, code, details = null, body = null }) {
    super(message);
    this.name = 'MefyxApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

/** A dependency-free client for the server's JSON APIs. */
export class Mefyx {
  #baseUrl;
  #fetch;
  #headers;

  constructor({ baseUrl, apiKey, bearerToken, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
      throw new TypeError('baseUrl is required and must be your Mefyx deployment origin.');
    }
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new TypeError('baseUrl must be an HTTP(S) origin without a path, query, fragment, or credentials.');
    }
    if (apiKey !== undefined && bearerToken !== undefined) {
      throw new TypeError('Provide apiKey or bearerToken, not both.');
    }
    for (const [name, value] of [['apiKey', apiKey], ['bearerToken', bearerToken]]) {
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        throw new TypeError(`${name} must be a non-empty string when provided.`);
      }
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required (available in Node.js 18 and later).');
    }
    this.#baseUrl = url.origin;
    this.#fetch = fetchImpl;
    this.#headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (apiKey !== undefined) this.#headers['X-API-Key'] = apiKey;
    if (bearerToken !== undefined) this.#headers.Authorization = `Bearer ${bearerToken}`;
  }

  scan(request, options) {
    return this.#post('/api/v1/scan', request, options);
  }

  chat(request, options) {
    return this.#post('/api/v1/gateway/chat', request, options);
  }

  async #post(path, request, { signal } = {}) {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.#headers },
      body: JSON.stringify(request),
      signal,
    });
    const rawBody = await response.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }

    const envelope = isObject(body) ? body : null;
    if (!response.ok || envelope?.success === false) {
      const error = isObject(envelope?.error) ? envelope.error : null;
      const detail = envelope?.detail;
      const message = typeof error?.message === 'string' ? error.message
        : typeof detail === 'string' ? detail
          : typeof detail?.message === 'string' ? detail.message
            : `Mefyx request failed (HTTP ${response.status}).`;
      throw new MefyxApiError(message, {
        status: response.status,
        code: typeof error?.code === 'string' ? error.code : response.ok ? 'api_error' : 'http_error',
        details: error?.details ?? detail ?? null,
        body,
      });
    }

    if (envelope?.success !== true || !isObject(envelope.data)) {
      throw new MefyxApiError('Mefyx returned an invalid API response.', {
        status: response.status,
        code: 'invalid_response',
        body,
      });
    }
    return envelope.data;
  }
}
