import { DelayedError, Queue, Worker } from 'bullmq';
import { FeedService } from './feed.service';
import { FeedImportProcessor } from './feed-import.processor';
import { FeedRetryLaterError } from './feed-retry-later';

// A feed's log row says "running" from the moment its job is queued, so a job
// waiting its turn looks exactly like a dead one if you only read the clock.
// triggerSync must ask the queue instead, and a job whose row was given up on
// must not run. The last block replays it on a real local Redis:
//   FEED_REDIS_TEST=1 npx jest feed-stale-run

const CONFIG_ID = 7;
const TENANT_ID = 1;
const HOUR = 60 * 60 * 1000;

function hoursAgo(h: number) {
  return new Date(Date.now() - h * HOUR);
}

// Just enough of the log table: rows live in an array, newest id wins.
function makeLogRepo(rows: any[]) {
  let nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => {
      const hits = rows.filter((r) => Object.keys(where).every((k) => r[k] === where[k]));
      return hits.sort((a, b) => b.id - a.id)[0] ?? null;
    }),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => {
      if (!x.id) {
        x.id = nextId++;
        rows.push(x);
      }
      return x;
    }),
  };
}

function runningRow(id: number, startedAt: Date) {
  return { id, feedConfigId: CONFIG_ID, tenantId: TENANT_ID, status: 'running', startedAt } as any;
}

function makeService(rows: any[], queue: any) {
  const svc = Object.create(FeedService.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.importLogRepository = makeLogRepo(rows);
  svc.feedImportQueue = queue;
  svc.findConfigWithCredentials = jest.fn().mockResolvedValue({ id: CONFIG_ID, tenantId: TENANT_ID });
  return svc;
}

// A fake queue holding jobs per state; getJobs answers like BullMQ's.
function fakeQueue(jobs: Partial<Record<'waiting' | 'active' | 'delayed' | 'prioritized', any[]>> = {}) {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    getJobs: jest.fn(async (types: string[]) => types.flatMap((t) => (jobs as any)[t] ?? [])),
  };
}

const jobFor = (importLogId: number, extra: Record<string, unknown> = {}) => ({ data: { importLogId }, ...extra });

describe('triggerSync when the last run still says running', () => {
  it('leaves a run alone while its job is waiting in the queue, however long', async () => {
    const row = runningRow(1, hoursAgo(5));
    const queue = fakeQueue({ waiting: [jobFor(1)] });
    const svc = makeService([row], queue);

    const result = await svc.triggerSync(TENANT_ID, CONFIG_ID, { scheduledWindow: '2026110408' });

    expect(result.id).toBe(1);
    expect(row.status).toBe('running');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('leaves a run alone while its job waits to retry', async () => {
    const row = runningRow(1, hoursAgo(5));
    const queue = fakeQueue({ delayed: [jobFor(1)] });
    const svc = makeService([row], queue);

    await svc.triggerSync(TENANT_ID, CONFIG_ID);

    expect(row.status).toBe('running');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('leaves a long import alone while a worker is on it', async () => {
    const row = runningRow(1, hoursAgo(9));
    const queue = fakeQueue({ active: [jobFor(1, { processedOn: hoursAgo(6).getTime() })] });
    const svc = makeService([row], queue);

    await svc.triggerSync(TENANT_ID, CONFIG_ID);

    expect(row.status).toBe('running');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('starts again when a worker has been on it for over a day', async () => {
    const row = runningRow(1, hoursAgo(30));
    const queue = fakeQueue({ active: [jobFor(1, { processedOn: hoursAgo(25).getTime() })] });
    const svc = makeService([row], queue);

    const result = await svc.triggerSync(TENANT_ID, CONFIG_ID);

    expect(row.status).toBe('failed');
    expect(result.id).not.toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('starts again as soon as the job is gone, without waiting two hours', async () => {
    const row = runningRow(1, hoursAgo(1));
    const queue = fakeQueue();
    const svc = makeService([row], queue);

    const result = await svc.triggerSync(TENANT_ID, CONFIG_ID, { scheduledWindow: '2026110407' });

    expect(row.status).toBe('failed');
    expect(row.errors[0].error).not.toContain('superseded');
    expect(result.id).not.toBe(1);
    expect(result.status).toBe('running');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('allows for a row saved a moment before its job is added', async () => {
    const row = runningRow(1, new Date(Date.now() - 1000));
    const queue = fakeQueue();
    const svc = makeService([row], queue);

    const result = await svc.triggerSync(TENANT_ID, CONFIG_ID);

    expect(result.id).toBe(1);
    expect(row.status).toBe('running');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does not take another run's job for this one", async () => {
    const row = runningRow(2, hoursAgo(1));
    const queue = fakeQueue({ waiting: [jobFor(1)] });
    const svc = makeService([row], queue);

    await svc.triggerSync(TENANT_ID, CONFIG_ID);

    expect(row.status).toBe('failed');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});

describe('processImport for a run that was given up on', () => {
  function importHarness(status: string) {
    const log = { id: 1, status, errors: [{ ref: 'system', error: 'gave up' }] };
    const svc = Object.create(FeedService.prototype) as any;
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = { id: CONFIG_ID, tenantId: TENANT_ID, provider: 'resales', credentials: {}, removeMissing: false };
    svc.feedConfigRepository = { findOne: jest.fn().mockResolvedValue(config), find: jest.fn().mockResolvedValue([config]), save: jest.fn() };
    svc.importLogRepository = { findOne: jest.fn().mockResolvedValue(log), save: jest.fn() };
    svc.tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: TENANT_ID, settings: {} }) };
    const fetchProperties = jest.fn().mockResolvedValue({ properties: [], hasMore: false, totalCount: 0 });
    svc.getAdapter = () => ({ fetchProperties });
    return { svc, log, fetchProperties };
  }

  it.each(['failed', 'success', 'partial'])('does no work and keeps the row when it says %s', async (status) => {
    const { svc, log, fetchProperties } = importHarness(status);

    await svc.processImport(CONFIG_ID, 1);

    expect(fetchProperties).not.toHaveBeenCalled();
    expect(log.status).toBe(status);
    expect(svc.feedConfigRepository.save).not.toHaveBeenCalled();
  });

  it('still imports a run that is running', async () => {
    const { svc, log, fetchProperties } = importHarness('running');

    await svc.processImport(CONFIG_ID, 1);

    expect(fetchProperties).toHaveBeenCalledTimes(1);
    expect(log.status).toBe('success');
  });
});

// Real BullMQ on the local Redis, on a throw-away queue name.
const describeRedis = process.env.FEED_REDIS_TEST ? describe : describe.skip;

describeRedis('the morning queue on a real Redis', () => {
  const connection = { host: '127.0.0.1', port: 6379 };
  let queue: Queue;
  let worker: Worker | undefined;

  beforeEach(() => {
    queue = new Queue(`feed-stale-test-${process.pid}-${Date.now()}`, { connection });
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('a feed queued at 06:00 is one job at 08:00 and 10:00, and imports once', async () => {
    const rows: any[] = [];
    const svc = makeService(rows, queue);

    const first = await svc.triggerSync(TENANT_ID, CONFIG_ID, { scheduledWindow: '2026110406' });
    first.startedAt = hoursAgo(2.1);
    await svc.triggerSync(TENANT_ID, CONFIG_ID, { scheduledWindow: '2026110408' });
    first.startedAt = hoursAgo(4.1);
    await svc.triggerSync(TENANT_ID, CONFIG_ID, { scheduledWindow: '2026110410' });

    expect(rows).toHaveLength(1);
    expect(first.status).toBe('running');
    expect(await queue.getJobCounts('waiting')).toMatchObject({ waiting: 1 });

    const processed: number[] = [];
    await new Promise<void>((resolve) => {
      worker = new Worker(
        queue.name,
        async (job) => {
          processed.push(job.data.importLogId);
        },
        { connection },
      );
      worker.on('completed', () => resolve());
    });
    expect(processed).toEqual([first.id]);
  }, 20_000);

  it('a job being worked on counts as alive, a finished one does not', async () => {
    const rows: any[] = [];
    const svc = makeService(rows, queue);
    const first = await svc.triggerSync(TENANT_ID, CONFIG_ID);
    first.startedAt = hoursAgo(5);

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await new Promise<void>((started) => {
      worker = new Worker(
        queue.name,
        async () => {
          started();
          await held;
        },
        { connection },
      );
    });

    await svc.triggerSync(TENANT_ID, CONFIG_ID);
    expect(rows).toHaveLength(1);
    expect(first.status).toBe('running');

    const done = new Promise<void>((resolve) => worker!.on('completed', () => resolve()));
    release();
    await done;
    await worker!.close();
    worker = undefined;

    // Finished in the queue but the row still says running: the worker died
    // before writing back. Nothing will ever update it, so start again.
    await svc.triggerSync(TENANT_ID, CONFIG_ID);
    expect(first.status).toBe('failed');
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe('running');
  }, 20_000);
});

describe('a provider that refuses the import', () => {
  function refused(status: number) {
    const log: any = { id: 1, status: 'running' };
    const svc = Object.create(FeedService.prototype) as any;
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config: any = { id: CONFIG_ID, tenantId: TENANT_ID, provider: 'resales', credentials: {}, removeMissing: false };
    svc.feedConfigRepository = { findOne: jest.fn().mockResolvedValue(config), find: jest.fn().mockResolvedValue([config]), save: jest.fn() };
    svc.importLogRepository = { findOne: jest.fn().mockResolvedValue(log), save: jest.fn() };
    svc.tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: TENANT_ID, settings: {} }) };
    const err: any = new Error(`Request failed with status code ${status}`);
    err.response = { status };
    svc.getAdapter = () => ({ fetchProperties: jest.fn().mockRejectedValue(err) });
    return { svc, log, config };
  }

  it.each([403, 429])('keeps the run open on %i while tries are left', async (status) => {
    const { svc, log, config } = refused(status);

    await expect(svc.processImport(CONFIG_ID, 1, { retryIfRefused: true })).rejects.toBeInstanceOf(FeedRetryLaterError);

    expect(log.status).toBe('running');
    expect(config.lastSyncAt).toBeUndefined();
    expect(svc.feedConfigRepository.save).not.toHaveBeenCalled();
  });

  it('fails the run once the tries are used up', async () => {
    const { svc, log, config } = refused(403);

    await svc.processImport(CONFIG_ID, 1, { retryIfRefused: false });

    expect(log.status).toBe('failed');
    expect(config.lastSyncStatus).toBe('failed');
  });

  it('fails straight away on other errors, 401 included', async () => {
    const { svc, log } = refused(401);

    await svc.processImport(CONFIG_ID, 1, { retryIfRefused: true });

    expect(log.status).toBe('failed');
  });

  it('delays the job longer each time, keeping the failure count at zero', async () => {
    const feedService = { processImport: jest.fn().mockRejectedValue(new FeedRetryLaterError('403')) };
    const processor = new FeedImportProcessor(feedService as any);
    (processor as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const job: any = {
      data: { configId: CONFIG_ID, importLogId: 1, tenantId: TENANT_ID, refusedCount: 1 },
      updateData: jest.fn(),
      moveToDelayed: jest.fn(),
    };
    const before = Date.now();

    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);

    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ refusedCount: 2 }));
    const [until, token] = job.moveToDelayed.mock.calls[0];
    expect(until).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(token).toBe('tok');
  });

  it('asks for a plain failure once all the delays are used', async () => {
    const feedService = { processImport: jest.fn().mockResolvedValue(undefined) };
    const processor = new FeedImportProcessor(feedService as any);
    (processor as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    await processor.process({ data: { configId: CONFIG_ID, importLogId: 1, tenantId: TENANT_ID, refusedCount: 3 } } as any);

    expect(feedService.processImport).toHaveBeenCalledWith(CONFIG_ID, 1, expect.objectContaining({ retryIfRefused: false }));
  });
});

describeRedis('a refused import on a real Redis', () => {
  it('waits in the queue without failing, stays alive for triggerSync, then finishes', async () => {
    const connection = { host: '127.0.0.1', port: 6379 };
    const queue = new Queue(`feed-refused-test-${process.pid}-${Date.now()}`, { connection });
    const rows: any[] = [];
    const svc = makeService(rows, queue);
    const first = await svc.triggerSync(TENANT_ID, CONFIG_ID);
    first.startedAt = hoursAgo(5);

    const feedService = {
      processImport: jest
        .fn()
        .mockRejectedValueOnce(new FeedRetryLaterError('403'))
        .mockResolvedValueOnce(undefined),
    };
    const processor = new FeedImportProcessor(feedService as any);
    (processor as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const worker = new Worker(queue.name, (job, token) => processor.process(job as any, token), { connection });
    const failed = jest.fn();
    worker.on('failed', failed);
    try {
      await new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const tick = async () => {
          if ((await queue.getJobCounts('delayed')).delayed === 1) return resolve();
          if (Date.now() - started > 10_000) return reject(new Error('job never delayed'));
          setTimeout(tick, 100);
        };
        tick();
      });

      const [job] = await queue.getJobs(['delayed']);
      expect(job.data.refusedCount).toBe(1);
      expect(job.delay).toBeGreaterThan(29 * 60 * 1000);

      await svc.triggerSync(TENANT_ID, CONFIG_ID);
      expect(rows).toHaveLength(1);
      expect(first.status).toBe('running');

      const done = new Promise<void>((resolve) => worker.on('completed', () => resolve()));
      await job.promote();
      await done;

      expect(feedService.processImport).toHaveBeenCalledTimes(2);
      expect(failed).not.toHaveBeenCalled();
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 30_000);
});
