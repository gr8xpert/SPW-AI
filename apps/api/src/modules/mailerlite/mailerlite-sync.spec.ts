import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { MailerLiteSyncService, PAGE_SIZE, SLICE_MS, BAD_KEY_MESSAGE } from './mailerlite-sync.service';
import { MailerLiteWebhookService } from './mailerlite-webhook.service';
import { MailerLiteClient, type MailerLiteClientOptions } from './mailerlite.client';
import { planContact, subscriberFields, tagGroupName, type ContactRow } from './mailerlite-contacts';

// The sync against the real fake server (scripts/dev/fake-mailerlite.js) over
// HTTP, with the database replaced by arrays. No import pacing: the fake's own
// limit is off and sleeping is skipped.

const FAKE = join(__dirname, '..', '..', '..', '..', '..', 'scripts', 'dev', 'fake-mailerlite.js');

let proc: ChildProcess;
let root: string;

beforeAll(async () => {
  proc = spawn(process.execPath, [FAKE], { env: { ...process.env, FAKE_ML_PORT: '0', FAKE_ML_IMPORT_LIMIT: '0' } });
  root = await new Promise<string>((resolve, reject) => {
    proc.stdout!.on('data', (d: Buffer) => {
      const m = /http:\/\/localhost:(\d+)/.exec(d.toString());
      if (m) resolve(`http://localhost:${m[1]}`);
    });
    proc.on('error', reject);
  });
});

afterAll(() => {
  proc.kill();
});

beforeEach(async () => {
  await fetch(`${root}/__reset`, { method: 'POST' });
});

const state = async () =>
  (await (await fetch(`${root}/__state`)).json()) as {
    subscribers: { id: string; email: string; status: string; fields: Record<string, string>; groups: { id: string; name: string }[] }[];
    groups: { id: string; name: string }[];
    requests: { method: string; url: string; body: { requests?: { method: string; path: string; body?: Record<string, unknown> }[] } }[];
  };

const subscriberOf = async (email: string) => (await state()).subscribers.find((s) => s.email === email);
const groupNamesOf = async (email: string) => ((await subscriberOf(email))?.groups ?? []).map((g) => g.name).sort();

type Row = ContactRow & { tenantId: number; updatedAt: Date };

let nextId = 1;
function contact(email: string, extra: Partial<Row> = {}): Row {
  return { id: nextId++, tenantId: 1, email, name: null, subscribed: true, unsubscribedAt: null, bounceCount: 0, tags: null, preferences: null, updatedAt: new Date(), ...extra };
}

function setup(rows: Row[], connExtra: Record<string, unknown> = {}, apiKey = 'good-key') {
  const conn: Record<string, unknown> = {
    id: 5, tenantId: 1, apiKey, enabled: true, consentAt: new Date(), state: 'queued', webhookId: 'w1', groupMode: 'contacts_and_tags', languageField: null,
    runStartedAt: null, runSince: null, runCursor: 0, heartbeatAt: null, lastSyncStartedAt: null, lastFullSyncAt: null,
    countAdded: 0, countUpdated: 0, countUnchanged: 0, countSkipped: 0, countFailed: 0, lastError: null, lastSyncAt: null,
    ...connExtra,
  };
  const pageSizes: number[] = [];
  const connections = {
    createQueryBuilder: () => {
      const qb = { addSelect: () => qb, where: () => qb, getOne: async () => ({ ...conn }) };
      return qb;
    },
    update: jest.fn(async (_: unknown, patch: Record<string, unknown>) => {
      Object.assign(conn, patch);
      return { affected: 1 };
    }),
    findOne: jest.fn(async () => ({ ...conn })),
  };
  const contacts = {
    find: jest.fn(async (q: { where: { tenantId: number; id: { value: number }; updatedAt?: { value: Date } }; take: number }) => {
      const page = rows
        .filter((r) => r.tenantId === q.where.tenantId && r.id > q.where.id.value && (!q.where.updatedAt || r.updatedAt >= q.where.updatedAt.value))
        .sort((a, b) => a.id - b.id)
        .slice(0, q.take);
      pageSizes.push(page.length);
      return page;
    }),
    update: jest.fn(async (where: { tenantId: number; email: { value: string[] }; subscribed: boolean }, patch: Record<string, unknown>) => {
      let affected = 0;
      for (const r of rows) {
        if (r.tenantId === where.tenantId && r.subscribed === where.subscribed && where.email.value.includes(r.email.toLowerCase())) {
          Object.assign(r, { subscribed: false, unsubscribedAt: patch.unsubscribedAt });
          affected++;
        }
      }
      return { affected };
    }),
  };
  const config = { get: (k: string) => (k === 'MAILERLITE_API_URL' ? `${root}/api` : undefined) };
  const webhook = new MailerLiteWebhookService(connections as never, contacts as never);
  const service = new MailerLiteSyncService(connections as never, contacts as never, webhook, config as never);
  // No waiting in tests.
  const realClient = service.client.bind(service);
  service.client = (key: string, overrides: Partial<MailerLiteClientOptions> = {}): MailerLiteClient => realClient(key, { sleep: async () => undefined, ...overrides });
  return { service, conn, connections, contacts, pageSizes };
}

async function runToEnd(service: MailerLiteSyncService): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const r = await service.runSlice(1);
    if (r.kind !== 'continue') return;
  }
  throw new Error('never finished');
}

describe('planContact', () => {
  const base = contact('a@b.c');
  it('sorts contacts', () => {
    expect(planContact(base).kind).toBe('send');
    expect(planContact({ ...base, email: 'x@no-email.invalid' }).kind).toBe('skip');
    expect(planContact({ ...base, email: 'erased-5@erased.invalid', subscribed: false, unsubscribedAt: new Date() }).kind).toBe('skip');
    expect(planContact({ ...base, subscribed: false, unsubscribedAt: new Date() }).kind).toBe('leave');
    expect(planContact({ ...base, subscribed: false, unsubscribedAt: null }).kind).toBe('skip');
    expect(planContact({ ...base, bounceCount: 1 }).kind).toBe('skip');
  });
});

describe('subscriberFields', () => {
  it('splits the name, adds the language, leaves out what is empty', () => {
    expect(subscriberFields({ name: 'Anna van Dijk', preferences: { language: 'nl' } }, 'spm_language')).toEqual({ name: 'Anna', last_name: 'van Dijk', spm_language: 'nl' });
    expect(subscriberFields({ name: 'Anna', preferences: { language: 'nl' } }, null)).toEqual({ name: 'Anna' });
    expect(subscriberFields({ name: null, preferences: null }, 'spm_language')).toEqual({});
  });
});

describe('MailerLiteSyncService against the fake server', () => {
  it('adds people with names, language and groups, creating each group once', async () => {
    const rows = [
      contact('anna@example.com', { name: 'Anna van Dijk', tags: ['vip', 'golf'], preferences: { language: 'nl' } }),
      contact('ben@example.com', { name: 'Ben', tags: ['vip'] }),
    ];
    const { service, conn } = setup(rows);
    await runToEnd(service);

    const anna = await subscriberOf('anna@example.com');
    expect(anna?.status).toBe('active');
    expect(anna?.fields).toMatchObject({ name: 'Anna', last_name: 'van Dijk', spm_language: 'nl' });
    expect(await groupNamesOf('anna@example.com')).toEqual(['SPM contacts', 'SPM: golf', 'SPM: vip']);
    expect(await groupNamesOf('ben@example.com')).toEqual(['SPM contacts', 'SPM: vip']);
    expect((await state()).groups.map((g) => g.name).sort()).toEqual(['SPM contacts', 'SPM: golf', 'SPM: vip']);
    expect(conn).toMatchObject({ state: 'idle', countAdded: 2, countFailed: 0, runStartedAt: null, runCursor: 0 });
    expect(conn.lastSyncAt).toBeInstanceOf(Date);
    expect(conn.lastFullSyncAt).toBeInstanceOf(Date);
  });

  it('skips made-up, unsubscribed, never-subscribed and bounced addresses', async () => {
    const rows = [
      contact('real@example.com'),
      contact('nobody@no-email.invalid'),
      contact('left@example.com', { subscribed: false, unsubscribedAt: new Date() }),
      contact('imported@example.com', { subscribed: false, unsubscribedAt: null }),
      contact('bounced@example.com', { bounceCount: 2 }),
    ];
    const { service, conn } = setup(rows);
    await runToEnd(service);
    expect((await state()).subscribers.map((s) => s.email)).toEqual(['real@example.com']);
    expect(conn).toMatchObject({ countAdded: 1, countSkipped: 4 });
  });

  it('never sends resubscribe or an active status, in any request', async () => {
    const rows = [contact('new@example.com'), contact('old@example.com', { subscribed: false, unsubscribedAt: new Date() })];
    const { service } = setup(rows);
    await fetch(`${root}/api/subscribers`, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'old@example.com' }) });
    await runToEnd(service);

    const sent = (await state()).requests.flatMap((r) => r.body?.requests ?? []).map((r) => r.body).filter(Boolean) as Record<string, unknown>[];
    expect(sent.length).toBeGreaterThan(0);
    for (const body of sent) {
      expect(body).not.toHaveProperty('resubscribe');
      expect(body.status).not.toBe('active');
    }
  });

  it('marks someone who left in SPM as unsubscribed in MailerLite, and creates nobody who was never there', async () => {
    const rows = [contact('gone@example.com', { subscribed: false, unsubscribedAt: new Date() }), contact('never@example.com', { subscribed: false, unsubscribedAt: new Date() })];
    await fetch(`${root}/api/subscribers`, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'gone@example.com' }) });
    const { service, conn } = setup(rows);
    await runToEnd(service);
    expect((await subscriberOf('gone@example.com'))?.status).toBe('unsubscribed');
    expect(await subscriberOf('never@example.com')).toBeUndefined();
    expect(conn).toMatchObject({ countUpdated: 1, countSkipped: 1 });
  });

  it('someone who left in MailerLite stays out, and SPM catches up', async () => {
    const row = contact('left-there@example.com', { tags: ['vip'] });
    const { service, conn } = setup([row]);
    await fetch(`${root}/api/subscribers`, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'left-there@example.com', status: 'unsubscribed' }) });
    await runToEnd(service);
    const s = await subscriberOf('left-there@example.com');
    expect(s?.status).toBe('unsubscribed');
    expect(s?.groups).toEqual([]);
    expect(row.subscribed).toBe(false);
    expect(conn).toMatchObject({ countSkipped: 1, countAdded: 0, countUpdated: 0 });
  });

  it('reuses groups that already exist, whatever their case', async () => {
    const auth = { Authorization: 'Bearer x', 'Content-Type': 'application/json' };
    for (const name of ['SPM contacts', 'spm: VIP', 'Client list']) {
      await fetch(`${root}/api/groups`, { method: 'POST', headers: auth, body: JSON.stringify({ name }) });
    }
    const { service } = setup([contact('a@example.com', { tags: ['vip'] })]);
    await runToEnd(service);
    const { groups } = await state();
    expect(groups.map((g) => g.name)).toEqual(['SPM contacts', 'spm: VIP', 'Client list']);
    expect(await groupNamesOf('a@example.com')).toEqual(['SPM contacts', 'spm: VIP']);
  });

  it('a removed tag takes them out of that group; the group and the client\'s own groups stay', async () => {
    const row = contact('a@example.com', { tags: ['vip', 'golf'] });
    const { service, conn } = setup([row]);
    await runToEnd(service);

    const auth = { Authorization: 'Bearer x', 'Content-Type': 'application/json' };
    const own = (await (await fetch(`${root}/api/groups`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Client list' }) })).json()) as { data: { id: string } };
    const sub = await subscriberOf('a@example.com');
    await fetch(`${root}/api/subscribers`, { method: 'POST', headers: auth, body: JSON.stringify({ email: sub!.email, groups: [own.data.id] }) });

    row.tags = ['vip'];
    row.updatedAt = new Date(Date.now() + 60_000);
    conn.state = 'queued';
    await runToEnd(service);
    expect(await groupNamesOf('a@example.com')).toEqual(['Client list', 'SPM contacts', 'SPM: vip']);
    expect((await state()).groups.map((g) => g.name)).toContain('SPM: golf');
    expect(conn.countUpdated).toBe(1);
  });

  it('a second run with nothing changed sends no upserts', async () => {
    const row = contact('a@example.com', { name: 'Anna Berg', tags: ['vip'], preferences: { language: 'de' } });
    const { service, conn } = setup([row]);
    await runToEnd(service);
    const before = (await state()).requests.length;

    row.updatedAt = new Date(Date.now() + 60_000);
    conn.state = 'queued';
    await runToEnd(service);
    expect(conn).toMatchObject({ countUnchanged: 1, countAdded: 0, countUpdated: 0 });
    const posted = (await state()).requests.slice(before).flatMap((r) => r.body?.requests ?? []).filter((r) => r.method === 'POST');
    expect(posted).toEqual([]);
  });

  it('after a full run, only contacts changed since the last one are looked at', async () => {
    const old = contact('old@example.com');
    const { service, conn, contacts } = setup([old]);
    await runToEnd(service);
    old.updatedAt = new Date(0);
    const fresh = contact('fresh@example.com', { updatedAt: new Date(Date.now() + 60_000) });
    (contacts.find as jest.Mock).mockClear();
    const { service: second, conn: conn2 } = setup([old, fresh], { ...conn, state: 'queued' });
    await runToEnd(second);
    expect(conn2).toMatchObject({ countAdded: 1, countUnchanged: 0 });
    expect(await subscriberOf('fresh@example.com')).toBeDefined();
  });

  it('a full pass comes round again after a week', async () => {
    const old = contact('old@example.com', { updatedAt: new Date(0) });
    const week = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { service, conn } = setup([old], { lastFullSyncAt: week, lastSyncStartedAt: new Date() });
    await runToEnd(service);
    expect(conn.countAdded).toBe(1);
  });

  it('pages through large lists, never more than a page at a time', async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => contact(`p${i}@example.com`));
    const { service, conn, pageSizes } = setup(rows);
    await runToEnd(service);
    expect(Math.max(...pageSizes)).toBeLessThanOrEqual(PAGE_SIZE);
    expect(pageSizes.slice(0, 4)).toEqual([PAGE_SIZE, PAGE_SIZE, 3, 0]);
    expect(conn.countAdded).toBe(rows.length);
    expect((await state()).subscribers).toHaveLength(rows.length);
  });

  it('stops a piece at the time limit and the next piece carries on from the cursor', async () => {
    const rows = Array.from({ length: PAGE_SIZE + 2 }, (_, i) => contact(`s${i}@example.com`));
    const { service, conn } = setup(rows);
    let t = 1_000_000;
    // Each look at the clock moves it on, so one page fits in the piece.
    const clock = () => (t += SLICE_MS / 2);
    const first = await service.runSlice(1, clock);
    expect(first.kind).toBe('continue');
    expect(conn.runCursor).toBe(rows[PAGE_SIZE - 1].id);
    expect(conn.countAdded).toBe(PAGE_SIZE);
    expect((await state()).subscribers).toHaveLength(PAGE_SIZE);

    await runToEnd(service);
    expect(conn.countAdded).toBe(rows.length);
    expect(conn.state).toBe('idle');
  });

  it('a 429 keeps the cursor and comes back after Retry-After', async () => {
    const rows = [contact('a@example.com')];
    const { service, conn } = setup(rows);
    await fetch(`${root}/__rate-limit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 42 }) });
    const r = await service.runSlice(1);
    expect(r).toEqual({ kind: 'continue', delayMs: 43_000 });
    expect(conn.state).toBe('running');
    expect(conn.runCursor).toBe(0);

    await runToEnd(service);
    expect(await subscriberOf('a@example.com')).toBeDefined();
  });

  it('a refused key needs attention, says so plainly, and does not retry', async () => {
    const { service, conn } = setup([contact('a@example.com')], {}, 'bad-key');
    await expect(service.runSlice(1)).resolves.toEqual({ kind: 'stopped' });
    expect(conn).toMatchObject({ state: 'needs_attention', lastError: BAD_KEY_MESSAGE });
    await expect(service.runSlice(1)).resolves.toEqual({ kind: 'stopped' });
    expect((await state()).requests).toHaveLength(1);
  });

  it('does nothing without consent, or when disconnected', async () => {
    const noConsent = setup([contact('a@example.com')], { consentAt: null });
    await expect(noConsent.service.runSlice(1)).resolves.toEqual({ kind: 'stopped' });
    const off = setup([contact('a@example.com')], { enabled: false });
    await expect(off.service.runSlice(1)).resolves.toEqual({ kind: 'stopped' });
    expect((await state()).requests).toHaveLength(0);
  });

  it('stops when disconnected in the middle of a piece', async () => {
    const rows = Array.from({ length: PAGE_SIZE + 2 }, (_, i) => contact(`d${i}@example.com`));
    const { service, connections, conn } = setup(rows);
    (connections.findOne as jest.Mock).mockResolvedValueOnce({ id: 5, enabled: false, webhookId: null });
    await expect(service.runSlice(1)).resolves.toEqual({ kind: 'stopped' });
    expect(conn.countAdded).toBe(PAGE_SIZE);
    expect((await state()).subscribers).toHaveLength(PAGE_SIZE);
  });

  it('a failed run keeps its place and the next one resumes', async () => {
    const rows = [contact('a@example.com'), contact('b@example.com')];
    const { service, conn } = setup(rows, { state: 'failed', runStartedAt: new Date(), runCursor: rows[0].id });
    conn.state = 'queued';
    await runToEnd(service);
    expect(await subscriberOf('a@example.com')).toBeUndefined();
    expect(await subscriberOf('b@example.com')).toBeDefined();
  });

  it('isolates clients: another tenant\'s contacts are never read', async () => {
    const { service } = setup([contact('mine@example.com'), contact('theirs@example.com', { tenantId: 2 })]);
    await runToEnd(service);
    expect((await state()).subscribers.map((s) => s.email)).toEqual(['mine@example.com']);
  });

  it('shortens a very long tag to a name MailerLite takes', () => {
    expect(tagGroupName('x'.repeat(400))).toHaveLength(255);
  });
});
