import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { MailerLiteConnectionService } from './mailerlite-connection.service';
import { MailerLiteProcessor } from './mailerlite.processor';
import { MailerLiteCron } from './mailerlite.cron';
import { MailerLiteAuthError, MailerLiteError, MailerLiteRateLimitError } from './mailerlite.client';

function setup(existing: Record<string, unknown> | null = null, apiUrl: string | undefined = 'https://api.example.com/') {
  let row: Record<string, unknown> | null = existing;
  const connections = {
    createQueryBuilder: () => {
      const qb = { addSelect: () => qb, where: () => qb, getOne: async () => (row ? { ...row } : null) };
      return qb;
    },
    update: jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      if (!row || (where.state !== undefined && where.state !== row.state)) return { affected: 0 };
      row = { ...row, ...patch };
      return { affected: 1 };
    }),
    insert: jest.fn(async (fields: Record<string, unknown>) => {
      row = { id: 1, ...fields };
    }),
  };
  const queue = { add: jest.fn(async () => undefined) };
  const client = {
    testKey: jest.fn(async () => undefined),
    createWebhook: jest.fn(async () => ({ id: 'hook-1', secret: 'whsec' })),
    deleteWebhook: jest.fn(async () => undefined),
  };
  const sync = { client: jest.fn(() => client) };
  const config = { get: () => apiUrl };
  const service = new MailerLiteConnectionService(connections as never, queue as never, sync as never, config as never);
  return { service, connections, queue, client, sync, row: () => row };
}

const connected = {
  id: 1, tenantId: 1, apiKey: 'old-key-1234', webhookId: 'old-hook', enabled: true, consentAt: new Date(), consentByEmail: 'boss@x.y',
  state: 'idle', heartbeatAt: null, countAdded: 3, countUpdated: 2, countUnchanged: 1, countSkipped: 4, countFailed: 0, lastSyncAt: new Date(), lastError: null,
};

describe('MailerLiteConnectionService', () => {
  it('status shows the last 4 of the key and no secret', async () => {
    const { service } = setup({ ...connected, webhookSecret: 'whsec', hookToken: 'tok' });
    const status = await service.status(1);
    expect(status).toMatchObject({ connected: true, keyLast4: '1234', syncing: false, counts: { added: 3, updated: 2, unchanged: 1, skipped: 4, failed: 0 } });
    const text = JSON.stringify(status);
    expect(text).not.toContain('old-key');
    expect(text).not.toContain('whsec');
    expect(text).not.toContain('tok');
  });

  it('status without a connection', async () => {
    await expect(setup().service.status(1)).resolves.toMatchObject({ connected: false, keyLast4: null });
  });

  it('connect checks the key first, creates the webhook with the public URL, and asks for consent', async () => {
    const { service, client, connections, row, queue } = setup();
    const status = await service.connect(1, '  new-key-5678 ');
    expect(client.testKey).toHaveBeenCalled();
    const hook = (client.createWebhook.mock.calls as unknown[][])[0][0] as { url: string; events: string[] };
    expect(hook.url).toMatch(/^https:\/\/api\.example\.com\/api\/webhooks\/mailerlite\/[0-9a-f]{48}$/);
    expect(hook.events).toEqual(['subscriber.unsubscribed', 'subscriber.bounced', 'subscriber.spam_reported']);
    expect(connections.insert).toHaveBeenCalled();
    expect(row()).toMatchObject({ apiKey: 'new-key-5678', webhookSecret: 'whsec', webhookId: 'hook-1', consentAt: null });
    expect(status).toMatchObject({ connected: true, keyLast4: '5678', consent: null });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('a bad key is a plain error and nothing is saved', async () => {
    const { service, client, connections } = setup();
    client.testKey.mockRejectedValueOnce(new MailerLiteAuthError('no', 401));
    await expect(service.connect(1, 'wrong-key-000')).rejects.toBeInstanceOf(BadRequestException);
    expect(client.createWebhook).not.toHaveBeenCalled();
    expect(connections.insert).not.toHaveBeenCalled();
  });

  it('a webhook that can not be made means no connection', async () => {
    const { service, client, connections } = setup();
    client.createWebhook.mockRejectedValueOnce(new MailerLiteError('nope', 422));
    await expect(service.connect(1, 'good-key-000')).rejects.toBeInstanceOf(BadGatewayException);
    expect(connections.insert).not.toHaveBeenCalled();
  });

  it('being rate limited at connect is a plain error too', async () => {
    const { service, client } = setup();
    client.testKey.mockRejectedValueOnce(new MailerLiteRateLimitError(60));
    await expect(service.connect(1, 'good-key-000')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('no public URL configured: no connection', async () => {
    const { service, client } = setup(null, '');
    await expect(service.connect(1, 'good-key-000')).rejects.toBeInstanceOf(BadGatewayException);
    expect(client.testKey).not.toHaveBeenCalled();
  });

  it('connecting again replaces the old webhook and asks for consent again', async () => {
    const { service, client, row } = setup({ ...connected });
    await service.connect(1, 'new-key-5678');
    expect(client.deleteWebhook).toHaveBeenCalledWith('old-hook');
    expect(row()).toMatchObject({ apiKey: 'new-key-5678', webhookId: 'hook-1', consentAt: null, countAdded: 0, state: 'idle' });
  });

  it('disconnect removes the webhook and the secrets, even if MailerLite refuses', async () => {
    const { service, client, row } = setup({ ...connected, webhookSecret: 'whsec', hookToken: 'tok' });
    client.deleteWebhook.mockRejectedValueOnce(new MailerLiteAuthError('no', 401));
    const status = await service.disconnect(1);
    expect(client.deleteWebhook).toHaveBeenCalledWith('old-hook');
    expect(row()).toMatchObject({ apiKey: null, webhookSecret: null, hookToken: null, webhookId: null, enabled: false });
    expect(row()!.consentAt).toBeInstanceOf(Date);
    expect(status.connected).toBe(false);
  });

  it('consent records who and when, and starts the first sync', async () => {
    const { service, row, queue } = setup({ ...connected, consentAt: null });
    await service.confirmConsent(1, { sub: 7, email: 'boss@x.y' });
    expect(row()).toMatchObject({ consentByUserId: 7, consentByEmail: 'boss@x.y', state: 'queued' });
    expect(row()!.consentAt).toBeInstanceOf(Date);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('sync now refuses without a connection, without consent, and with a refused key', async () => {
    await expect(setup().service.syncNow(1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ ...connected, consentAt: null }).service.syncNow(1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ ...connected, state: 'needs_attention' }).service.syncNow(1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('one run at a time: a second click adds no job, a stuck one is replaced', async () => {
    const running = setup({ ...connected, state: 'running', heartbeatAt: new Date() });
    await expect(running.service.enqueue(1)).resolves.toBe(false);
    expect(running.queue.add).not.toHaveBeenCalled();

    const twice = setup({ ...connected });
    await expect(twice.service.enqueue(1)).resolves.toBe(true);
    await expect(twice.service.enqueue(1)).resolves.toBe(false);
    expect(twice.queue.add).toHaveBeenCalledTimes(1);

    const stuck = setup({ ...connected, state: 'running', heartbeatAt: new Date(Date.now() - 60 * 60 * 1000) });
    await expect(stuck.service.enqueue(1)).resolves.toBe(true);
  });

  it('job ids have no colons (BullMQ refuses them)', async () => {
    const { service, queue } = setup({ ...connected });
    await service.enqueue(1);
    const opts = (queue.add.mock.calls as unknown[][])[0][2] as { jobId: string };
    expect(opts.jobId).not.toContain(':');
  });
});

describe('MailerLiteProcessor', () => {
  const job = (attemptsMade = 0) => ({ data: { tenantId: 1 }, attemptsMade, opts: { attempts: 4 } }) as never;
  const lock = (acquired = true) => ({ withLock: jest.fn(async (_: string, __: number, fn: () => Promise<unknown>) => (acquired ? { acquired, result: await fn() } : { acquired })) });

  it('queues the next piece when a slice says continue, with its delay', async () => {
    const sync = { runSlice: jest.fn(async () => ({ kind: 'continue', delayMs: 5000 })), markFailed: jest.fn() };
    const connections = { addJob: jest.fn(async () => undefined) };
    await new MailerLiteProcessor(sync as never, connections as never, lock() as never).process(job());
    expect(connections.addJob).toHaveBeenCalledWith(1, 5000);
  });

  it('adds nothing when done', async () => {
    const sync = { runSlice: jest.fn(async () => ({ kind: 'done' })), markFailed: jest.fn() };
    const connections = { addJob: jest.fn(async () => undefined) };
    await new MailerLiteProcessor(sync as never, connections as never, lock() as never).process(job());
    expect(connections.addJob).not.toHaveBeenCalled();
  });

  it('comes back later when another piece of this client is running', async () => {
    const sync = { runSlice: jest.fn(), markFailed: jest.fn() };
    const connections = { addJob: jest.fn(async () => undefined) };
    await new MailerLiteProcessor(sync as never, connections as never, lock(false) as never).process(job());
    expect(sync.runSlice).not.toHaveBeenCalled();
    expect(connections.addJob).toHaveBeenCalledWith(1, 60_000);
  });

  it('marks failed only when the last try fails', async () => {
    const sync = { runSlice: jest.fn(async () => { throw new Error('down'); }), markFailed: jest.fn(async () => undefined) };
    const p = new MailerLiteProcessor(sync as never, { addJob: jest.fn() } as never, lock() as never);
    await expect(p.process(job(0))).rejects.toThrow('down');
    expect(sync.markFailed).not.toHaveBeenCalled();
    await expect(p.process(job(3))).rejects.toThrow('down');
    expect(sync.markFailed).toHaveBeenCalledWith(1, 'down');
  });
});

describe('MailerLiteCron', () => {
  const lock = { withLock: jest.fn() };

  it('queues connected clients with consent and the add-on; one failure does not stop the rest', async () => {
    const rows = [
      { tenantId: 1, consentAt: new Date(), state: 'idle' },
      { tenantId: 2, consentAt: new Date(), state: 'idle' },
      { tenantId: 3, consentAt: null, state: 'idle' },
      { tenantId: 4, consentAt: new Date(), state: 'needs_attention' },
      { tenantId: 5, consentAt: new Date(), state: 'idle' },
      { tenantId: 6, consentAt: new Date(), state: 'idle' },
    ];
    const tenants = [
      { id: 1, isActive: true, dashboardAddons: { emailCampaign: true } },
      { id: 2, isActive: true, dashboardAddons: { emailCampaign: true } },
      { id: 5, isActive: true, dashboardAddons: { emailCampaign: false } },
      { id: 6, isActive: false, dashboardAddons: { emailCampaign: true } },
    ];
    const enqueue = jest.fn(async (id: number) => {
      if (id === 1) throw new Error('redis');
      return true;
    });
    const cron = new MailerLiteCron(
      { find: async () => rows } as never,
      { find: async () => tenants } as never,
      { enqueue } as never,
      lock as never,
    );
    await expect(cron.enqueueAll()).resolves.toBe(1);
    expect(enqueue.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });
});
