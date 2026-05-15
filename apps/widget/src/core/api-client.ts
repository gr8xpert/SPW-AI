export interface ApiClientConfig {
  apiUrl: string;
  apiKey: string;
}

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

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(`${this.apiUrl}/api${endpoint}`, { method: 'DELETE' });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-API-Key', this.apiKey);

    const res = await fetch(url, { ...init, headers });

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

  getApiUrl(): string {
    return this.apiUrl;
  }
}
