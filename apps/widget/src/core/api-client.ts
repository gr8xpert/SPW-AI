export interface ApiClientConfig {
  apiUrl: string;
  apiKey: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
const GET_ATTEMPTS = 3;

export class ApiClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: ApiClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.apiUrl}/api${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value != null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.apiUrl}/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // A file upload (a voice search). Sent once, with a longer wait than a
  // read: the answer comes from an AI model, not the database. The browser
  // sets the multipart Content-Type itself.
  async postForm<T>(endpoint: string, form: FormData, timeoutMs = 30_000): Promise<T> {
    return this.request<T>(`${this.apiUrl}/api${endpoint}`, { method: 'POST', body: form }, timeoutMs);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(`${this.apiUrl}/api${endpoint}`, { method: 'DELETE' });
  }

  private async request<T>(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-API-Key', this.apiKey);

    const res = await this.fetchWithRetry(url, { ...init, headers }, timeoutMs);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `API error: ${res.status}`);
    }

    const json = await res.json();
    // Preserve paginated envelopes ({ data, meta }) — callers like searchProperties
    // need meta.{page,total,pages,limit}. Plain { data: T } envelopes get unwrapped.
    if (json && typeof json === 'object' && 'data' in json && 'meta' in json) {
      return json as T;
    }
    return (json.data !== undefined ? json.data : json) as T;
  }

  // A request that never gets an answer (a dead pooled connection, a dropped
  // mobile network) used to leave the dropdowns or cards empty until the
  // visitor refreshed. Each try now gives up after REQUEST_TIMEOUT_MS, and a
  // read that got no response is tried again. Writes are sent once: repeating
  // an inquiry could send it twice.
  private async fetchWithRetry(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    const method = (init.method || 'GET').toUpperCase();
    const attempts = method === 'GET' ? GET_ATTEMPTS : 1;
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } catch (err) {
        lastError = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Network error');
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}
