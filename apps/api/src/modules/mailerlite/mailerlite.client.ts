// MailerLite's API, one client per API key. Paces its own calls (120 a minute
// overall, 5 a minute for batches made only of subscriber upserts) and turns
// HTTP failures into the three errors the callers act on.

export const DEFAULT_MAILERLITE_API = 'https://connect.mailerlite.com/api';

const TIMEOUT_MS = 30_000;
// 120 a minute is one per 500 ms; a little slower keeps a margin.
const REQUEST_GAP_MS = 600;
// 5 a minute is one per 12 s.
export const IMPORT_GAP_MS = 13_000;
const DEFAULT_RETRY_AFTER_S = 60;
const MAX_RETRY_AFTER_S = 3600;
const MAX_LIST_PAGES = 15;
// MailerLite's maximum for one batch.
export const BATCH_MAX = 50;

export class MailerLiteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// The key was refused: retrying can't help, the client needs a new key.
export class MailerLiteAuthError extends MailerLiteError {}

export class MailerLiteRateLimitError extends MailerLiteError {
  constructor(readonly retryAfterS: number) {
    super('MailerLite asked us to slow down', 429);
  }
}

export interface MailerLiteGroup {
  id: string;
  name: string;
}

export interface MailerLiteSubscriber {
  id: string;
  email: string;
  status: string;
  fields?: Record<string, string | number | null>;
  // Absent when MailerLite didn't send them: then nothing can be said about groups.
  groups?: MailerLiteGroup[];
}

export interface BatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
}

export interface BatchResponse {
  code: number;
  body?: { data?: unknown; message?: string } | null;
}

export interface MailerLiteClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function retryAfterSeconds(header: string | null | undefined, nowMs = Date.now()): number {
  if (!header) return DEFAULT_RETRY_AFTER_S;
  const n = Number(header);
  const s = Number.isFinite(n) ? n : (Date.parse(header) - nowMs) / 1000;
  if (!Number.isFinite(s) || s <= 0) return DEFAULT_RETRY_AFTER_S;
  return Math.min(Math.ceil(s), MAX_RETRY_AFTER_S);
}

export class MailerLiteClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = 0;
  private lastImportAt = 0;

  constructor(opts: MailerLiteClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = opts.now ?? Date.now;
  }

  private async pace(lastAt: number, gapMs: number): Promise<void> {
    const wait = lastAt + gapMs - this.now();
    if (lastAt > 0 && wait > 0) await this.sleep(wait);
  }

  private async request<T>(method: BatchRequest['method'], path: string, body?: unknown): Promise<T> {
    await this.pace(this.lastRequestAt, REQUEST_GAP_MS);
    this.lastRequestAt = this.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        redirect: 'error',
      });
    } catch (err) {
      throw new MailerLiteError((err as Error).name === 'AbortError' ? 'MailerLite did not answer in time' : 'Could not reach MailerLite', 0);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return null as T;
    const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (res.status === 429) throw new MailerLiteRateLimitError(retryAfterSeconds(res.headers.get('retry-after'), this.now()));
    if (res.status === 401 || res.status === 403) throw new MailerLiteAuthError('MailerLite did not accept this API key', res.status);
    if (!res.ok) throw new MailerLiteError(String(json?.message || `MailerLite answered ${res.status}`).slice(0, 300), res.status);
    return json as T;
  }

  // The cheapest call that needs a valid key.
  async testKey(): Promise<void> {
    await this.request('GET', '/groups?limit=1');
  }

  // Groups whose name contains `name` (MailerLite matches partially).
  async listGroups(name: string): Promise<MailerLiteGroup[]> {
    const out: MailerLiteGroup[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const q = new URLSearchParams({ limit: '100', page: String(page), 'filter[name]': name });
      const res = await this.request<{ data?: MailerLiteGroup[]; links?: { next?: string | null } }>('GET', `/groups?${q}`);
      out.push(...(res?.data ?? []));
      if (!res?.links?.next) break;
    }
    return out;
  }

  async createGroup(name: string): Promise<MailerLiteGroup> {
    const res = await this.request<{ data?: MailerLiteGroup }>('POST', '/groups', { name });
    if (!res?.data?.id) throw new MailerLiteError('MailerLite sent an unexpected answer', 502);
    return res.data;
  }

  // The field's key, creating it when missing.
  async ensureTextField(name: string): Promise<string> {
    const q = new URLSearchParams({ limit: '100', 'filter[keyword]': name });
    const list = await this.request<{ data?: { name: string; key: string }[] }>('GET', `/fields?${q}`);
    const found = list?.data?.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (found?.key) return found.key;
    const created = await this.request<{ data?: { key?: string } }>('POST', '/fields', { name, type: 'text' });
    if (!created?.data?.key) throw new MailerLiteError('MailerLite sent an unexpected answer', 502);
    return created.data.key;
  }

  async createWebhook(input: { name: string; url: string; events: string[] }): Promise<{ id: string; secret: string }> {
    const res = await this.request<{ data?: { id?: string; secret?: string } }>('POST', '/webhooks', {
      ...input,
      enabled: true,
      batchable: false,
    });
    if (!res?.data?.id || !res.data.secret) throw new MailerLiteError('MailerLite sent an unexpected answer', 502);
    return { id: String(res.data.id), secret: res.data.secret };
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }

  // One subscriber, added or updated. Sent one at a time on purpose: MailerLite
  // documents that this call keeps `groups`, but runs batches made only of these
  // as a bulk import, where it does not say so. Answers like a batch item.
  async upsert(body: Record<string, unknown>): Promise<BatchResponse> {
    try {
      return { code: 200, body: await this.request<BatchResponse['body']>('POST', '/subscribers', body) };
    } catch (err) {
      if (err instanceof MailerLiteAuthError || err instanceof MailerLiteRateLimitError) throw err;
      if (err instanceof MailerLiteError && err.status >= 400 && err.status < 500) return { code: err.status, body: { message: err.message } };
      throw err;
    }
  }

  // One subscriber by address, outside a batch. Answers like a batch item (404 = not there).
  async lookup(email: string): Promise<BatchResponse> {
    try {
      return { code: 200, body: await this.request<BatchResponse['body']>('GET', `/subscribers/${encodeURIComponent(email)}?include=groups`) };
    } catch (err) {
      if (err instanceof MailerLiteAuthError || err instanceof MailerLiteRateLimitError) throw err;
      if (err instanceof MailerLiteError && err.status >= 400 && err.status < 500) return { code: err.status, body: { message: err.message } };
      throw err;
    }
  }

  // Up to 50 calls in one. A failed call doesn't fail the batch, its answer
  // holds the error; one that was rate limited stops the page so it is redone.
  async batch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    if (!requests.length) return [];
    if (requests.length > BATCH_MAX) throw new MailerLiteError(`A batch holds at most ${BATCH_MAX} calls`, 0);

    // Only subscriber upserts: MailerLite counts this as an import.
    const isImport = requests.every((r) => r.method === 'POST' && r.path === 'api/subscribers');
    if (isImport) {
      await this.pace(this.lastImportAt, IMPORT_GAP_MS);
      this.lastImportAt = this.now();
    }

    const res = await this.request<{ responses?: BatchResponse[] }>('POST', '/batch', { requests });
    const responses = res?.responses;
    if (!Array.isArray(responses) || responses.length !== requests.length) {
      throw new MailerLiteError('MailerLite sent an unexpected answer', 502);
    }
    if (responses.some((r) => r.code === 429)) throw new MailerLiteRateLimitError(DEFAULT_RETRY_AFTER_S);
    return responses;
  }
}
