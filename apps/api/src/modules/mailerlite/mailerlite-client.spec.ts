import {
  IMPORT_GAP_MS,
  MailerLiteAuthError,
  MailerLiteClient,
  MailerLiteError,
  MailerLiteRateLimitError,
  retryAfterSeconds,
} from './mailerlite.client';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function build(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let now = 1_000_000;
  const client = new MailerLiteClient({
    baseUrl: 'http://fake/api/',
    apiKey: 'test-key',
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answer(url, init);
    }) as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    now: () => now,
  });
  return { client, calls, sleeps };
}

describe('retryAfterSeconds', () => {
  it('reads seconds and dates, falls back on 60, caps at an hour', () => {
    expect(retryAfterSeconds('119')).toBe(119);
    expect(retryAfterSeconds(new Date(61_000).toUTCString(), 1_000)).toBe(60);
    expect(retryAfterSeconds(null)).toBe(60);
    expect(retryAfterSeconds('rubbish')).toBe(60);
    expect(retryAfterSeconds('0')).toBe(60);
    expect(retryAfterSeconds('999999')).toBe(3600);
  });
});

describe('MailerLiteClient', () => {
  it('sends the key as a bearer token', async () => {
    const { client, calls } = build(() => json(200, { data: [] }));
    await client.testKey();
    expect(calls[0].url).toBe('http://fake/api/groups?limit=1');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('401 and 403 are key problems', async () => {
    await expect(build(() => json(401, { message: 'Unauthenticated.' })).client.testKey()).rejects.toBeInstanceOf(MailerLiteAuthError);
    await expect(build(() => json(403, {})).client.testKey()).rejects.toBeInstanceOf(MailerLiteAuthError);
  });

  it('429 hands back Retry-After', async () => {
    const err = await build(() => json(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '119' }))
      .client.testKey()
      .catch((e) => e);
    expect(err).toBeInstanceOf(MailerLiteRateLimitError);
    expect((err as MailerLiteRateLimitError).retryAfterS).toBe(119);
  });

  it('a network failure and a 500 are plain errors, so the job retries', async () => {
    const down = build(() => {
      throw new Error('ECONNREFUSED');
    });
    const err = await down.client.testKey().catch((e) => e);
    expect(err).toBeInstanceOf(MailerLiteError);
    expect(err).not.toBeInstanceOf(MailerLiteAuthError);
    expect((err as MailerLiteError).status).toBe(0);
    await expect(build(() => json(500, { message: 'oops' })).client.testKey()).rejects.toMatchObject({ status: 500 });
  });

  it('follows group pages', async () => {
    const { client, calls } = build((url) =>
      new URL(url).searchParams.get('page') === '1'
        ? json(200, { data: [{ id: '1', name: 'SPM: a' }], links: { next: 'yes' } })
        : json(200, { data: [{ id: '2', name: 'SPM: b' }], links: { next: null } }),
    );
    await expect(client.listGroups('SPM')).resolves.toEqual([
      { id: '1', name: 'SPM: a' },
      { id: '2', name: 'SPM: b' },
    ]);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0].url).searchParams.get('filter[name]')).toBe('SPM');
  });

  it('spaces out calls', async () => {
    const { client, sleeps } = build(() => json(200, { data: [] }));
    await client.testKey();
    await client.testKey();
    expect(sleeps).toEqual([600]);
  });

  it('keeps batches of only subscriber upserts to the import limit, other batches not', async () => {
    const answer = (_: string, init: RequestInit) => {
      const { requests } = JSON.parse(init.body as string);
      return json(200, { responses: requests.map(() => ({ code: 200, body: {} })) });
    };
    const upsert = { method: 'POST' as const, path: 'api/subscribers', body: { email: 'a@b.c' } };
    const look = { method: 'GET' as const, path: 'api/subscribers/a%40b.c' };

    const imports = build(answer);
    await imports.client.batch([upsert]);
    await imports.client.batch([upsert]);
    expect(Math.max(...imports.sleeps)).toBeGreaterThanOrEqual(IMPORT_GAP_MS - 1000);

    const lookups = build(answer);
    await lookups.client.batch([look]);
    await lookups.client.batch([look]);
    expect(Math.max(...lookups.sleeps)).toBeLessThan(1000);
  });

  it('refuses more than 50 in a batch, and sends nothing for an empty one', async () => {
    const { client, calls } = build(() => json(200, { responses: [] }));
    await expect(client.batch([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
    const many = Array.from({ length: 51 }, () => ({ method: 'GET' as const, path: 'api/x' }));
    await expect(client.batch(many)).rejects.toBeInstanceOf(MailerLiteError);
    expect(calls).toHaveLength(0);
  });

  it('a rate limited call inside a batch stops the page', async () => {
    const { client } = build(() => json(200, { responses: [{ code: 200 }, { code: 429 }] }));
    await expect(client.batch([{ method: 'GET', path: 'api/a' }, { method: 'GET', path: 'api/b' }])).rejects.toBeInstanceOf(MailerLiteRateLimitError);
  });

  it('an unexpected batch answer is an error, not a silent success', async () => {
    const { client } = build(() => json(200, { responses: [] }));
    await expect(client.batch([{ method: 'GET', path: 'api/a' }])).rejects.toBeInstanceOf(MailerLiteError);
  });
});
