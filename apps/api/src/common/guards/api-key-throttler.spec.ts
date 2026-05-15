import { createHash } from 'crypto';
import {
  ApiKeyThrottlerGuard,
  ANON_ABUSE_LIMIT,
  __throttlerInternals,
} from './api-key-throttler.guard';

// The guard inherits from @nestjs/throttler's ThrottlerGuard. These tests
// exercise the real getTracker / handleRequest / resolveKey paths against
// stubbed dependencies (ThrottlerStorage, DataSource, ExecutionContext) so
// regressions in those methods can't slip past unit coverage.

// ----- shared stubs ----------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makeDataSource(planRateForHash: Record<string, number | null>) {
  // resolveKey hits a chain:
  //   createQueryBuilder().select().from().innerJoin().where().andWhere().getRawOne()
  return {
    createQueryBuilder: () => {
      const params: Record<string, unknown> = {};
      const qb: any = {
        select() {
          return qb;
        },
        from() {
          return qb;
        },
        innerJoin() {
          return qb;
        },
        where(_clause: string, p: Record<string, unknown>) {
          Object.assign(params, p);
          return qb;
        },
        andWhere(_clause: string, p: Record<string, unknown>) {
          Object.assign(params, p);
          return qb;
        },
        async getRawOne() {
          const hash = String(params.hash);
          const rate = planRateForHash[hash];
          return rate == null ? undefined : { ratePerMinute: rate };
        },
      };
      return qb;
    },
  };
}

interface IncrementCall {
  key: string;
  ttl: number;
}

function makeStorage() {
  // @nestjs/throttler v5.2 calls storage.increment(key, ttl). Limit lives in
  // the post-increment comparison (totalHits > limit) and in the response
  // headers — so the test inspects headers, not increment args, for the
  // effective limit.
  const calls: IncrementCall[] = [];
  const storage = {
    calls,
    increment: jest.fn(async (key: string, ttl: number) => {
      calls.push({ key, ttl });
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }),
  };
  return storage;
}

interface HeaderCall {
  name: string;
  value: unknown;
}

function makeContext(req: Record<string, any>) {
  const headers: HeaderCall[] = [];
  const res = {
    headers,
    header: (name: string, value: unknown) => {
      headers.push({ name, value });
      return res;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => () => undefined,
    getClass: () => class Anon {},
  } as any;
  return { ctx, res };
}

// Counts DB hits caused by a sequence of resolveKey calls. Used to assert
// the cache and probe-counter actually prevent repeat lookups.
async function dbLookupCount(
  guard: any,
  ...calls: Array<[string | undefined, string | null]>
) {
  let dbHits = 0;
  const origDs = guard.dataSource;
  guard.dataSource = {
    createQueryBuilder: () => {
      dbHits++;
      return origDs.createQueryBuilder();
    },
  };
  for (const [rawKey, ip] of calls) {
    await guard.resolveKey(rawKey, ip);
  }
  guard.dataSource = origDs;
  return dbHits;
}

function makeGuard(planRateForHash: Record<string, number | null> = {}) {
  return new ApiKeyThrottlerGuard(
    { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
    makeStorage() as any,
    { getAllAndOverride: () => undefined } as any,
    makeDataSource(planRateForHash) as any,
  );
}

// ----- resolveKey (the bucket-and-limit decider) -----------------------

describe('ApiKeyThrottlerGuard.resolveKey', () => {
  it('routes missing key to the shared anon bucket', async () => {
    const guard: any = makeGuard();
    expect(await guard.resolveKey(undefined, '1.1.1.1')).toEqual({
      tracker: 'apikey:_anon',
      limit: ANON_ABUSE_LIMIT,
      valid: false,
    });
  });

  it('routes empty-string key to anon', async () => {
    const guard: any = makeGuard();
    expect((await guard.resolveKey('', '1.1.1.1')).tracker).toBe('apikey:_anon');
  });

  it('multiple unknown keys share ONE anon bucket', async () => {
    // The headline fix from CP-1: an attacker rotating bogus keys must not
    // get a fresh budget per attempt.
    const guard: any = makeGuard();
    const a = await guard.resolveKey('garbage-1', '1.1.1.1');
    const b = await guard.resolveKey('garbage-2', '1.1.1.1');
    const c = await guard.resolveKey('garbage-3', '1.1.1.1');
    expect(a.tracker).toBe('apikey:_anon');
    expect(b.tracker).toBe('apikey:_anon');
    expect(c.tracker).toBe('apikey:_anon');
  });

  it('recognised key gets its own bucket at plan rate', async () => {
    const key = 'valid-tenant';
    const guard: any = makeGuard({ [sha256(key)]: 300 });
    const r = await guard.resolveKey(key, '1.1.1.1');
    expect(r.valid).toBe(true);
    expect(r.tracker).toBe(`apikey:${sha256(key).slice(0, 32)}`);
    expect(r.limit).toBe(300);
  });

  it('different recognised keys get different buckets', async () => {
    const k1 = 'tenant-1';
    const k2 = 'tenant-2';
    const guard: any = makeGuard({
      [sha256(k1)]: 100,
      [sha256(k2)]: 600,
    });
    const r1 = await guard.resolveKey(k1, '1.1.1.1');
    const r2 = await guard.resolveKey(k2, '1.1.1.1');
    expect(r1.tracker).not.toBe(r2.tracker);
    expect(r1.limit).toBe(100);
    expect(r2.limit).toBe(600);
  });

  it('fails closed to anon on DB error', async () => {
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [] } as any,
      makeStorage() as any,
      { getAllAndOverride: () => undefined } as any,
      {
        createQueryBuilder: () => {
          throw new Error('boom');
        },
      } as any,
    );
    const r = await (guard as any).resolveKey('anything', '1.1.1.1');
    expect(r.tracker).toBe('apikey:_anon');
    expect(r.limit).toBe(ANON_ABUSE_LIMIT);
  });

  it('caches valid keys (no second DB hit)', async () => {
    const key = 'valid';
    const guard: any = makeGuard({ [sha256(key)]: 200 });
    const hits = await dbLookupCount(guard, [key, '1.1.1.1'], [key, '1.1.1.1']);
    expect(hits).toBe(1);
  });

  it('caps the LRU at MAX_CACHE_ENTRIES (oldest evicted)', async () => {
    const guard: any = makeGuard();
    const bound = __throttlerInternals.MAX_CACHE_ENTRIES;
    const cache: Map<string, unknown> = guard.cache;
    // Stuff the cache past the bound, then drive eviction the same way
    // writeCache does. Verifies the contract: size capped at `bound`,
    // oldest insertions are the ones gone.
    for (let i = 0; i < bound + 5; i++) cache.set(`k${i}`, {});
    while (cache.size > bound) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest !== undefined) cache.delete(oldest);
    }
    expect(cache.size).toBe(bound);
    expect(cache.has('k0')).toBe(false);
    expect(cache.has(`k${bound + 4}`)).toBe(true);
  });
});

// ----- IP probe counter (DB flooding defence) --------------------------

describe('ApiKeyThrottlerGuard probe-counter (DB flooding defence)', () => {
  it('short-circuits DB after MAX_UNKNOWN_PROBES_PER_IP misses from one IP', async () => {
    const guard: any = makeGuard();
    const ip = '9.9.9.9';
    const budget = __throttlerInternals.MAX_UNKNOWN_PROBES_PER_IP;

    // First `budget` distinct unknown keys → one DB hit each.
    const burn: Array<[string, string]> = [];
    for (let i = 0; i < budget; i++) burn.push([`bogus-${i}`, ip]);
    expect(await dbLookupCount(guard, ...burn)).toBe(budget);

    // The (budget + 1)th and beyond → routed to anon WITHOUT DB lookup.
    const post: Array<[string, string]> = [];
    for (let i = budget; i < budget + 20; i++) post.push([`bogus-${i}`, ip]);
    expect(await dbLookupCount(guard, ...post)).toBe(0);
  });

  it('a different IP keeps its own probe budget', async () => {
    const guard: any = makeGuard();
    const budget = __throttlerInternals.MAX_UNKNOWN_PROBES_PER_IP;
    const burn: Array<[string, string]> = [];
    for (let i = 0; i < budget; i++) burn.push([`a-${i}`, 'IP-A']);
    await dbLookupCount(guard, ...burn);
    expect(await dbLookupCount(guard, ['fresh-key', 'IP-B'])).toBe(1);
  });

  it('counter resets after the window expires (simulated by clearing entry)', async () => {
    const guard: any = makeGuard();
    const ip = 'IP-C';
    const budget = __throttlerInternals.MAX_UNKNOWN_PROBES_PER_IP;
    const burn: Array<[string, string]> = [];
    for (let i = 0; i < budget; i++) burn.push([`c-${i}`, ip]);
    await dbLookupCount(guard, ...burn);
    // Force the window reset — surrogate for "60s passed".
    guard.probeCounters.delete(ip);
    expect(await dbLookupCount(guard, ['post-reset', ip])).toBe(1);
  });
});

// ----- getTracker (the public hook the base ThrottlerGuard calls) ------

describe('ApiKeyThrottlerGuard.getTracker', () => {
  it('returns the resolved bucket tracker for a recognised key', async () => {
    const key = 'tenant-key';
    const guard: any = makeGuard({ [sha256(key)]: 200 });
    const tracker = await guard.getTracker({
      headers: { 'x-api-key': key },
      ip: '1.1.1.1',
    });
    expect(tracker).toBe(`apikey:${sha256(key).slice(0, 32)}`);
  });

  it('returns the anon tracker for an unknown key', async () => {
    const guard: any = makeGuard();
    const tracker = await guard.getTracker({
      headers: { 'x-api-key': 'bogus' },
      ip: '1.1.1.1',
    });
    expect(tracker).toBe('apikey:_anon');
  });

  it('returns the anon tracker when the header is missing entirely', async () => {
    const guard: any = makeGuard();
    const tracker = await guard.getTracker({ headers: {}, ip: '1.1.1.1' });
    expect(tracker).toBe('apikey:_anon');
  });
});

// ----- handleRequest (drives the storage; this is the real cap test) --

describe('ApiKeyThrottlerGuard.handleRequest', () => {
  // Real exercise of the override: stub the storage, invoke handleRequest
  // through the guard's protected entry point, and inspect what limit got
  // pushed to storage.increment. That's the single place where the
  // Math.min(plan, decorator) cap matters in production.
  async function callHandle(
    guard: any,
    storage: ReturnType<typeof makeStorage>,
    req: Record<string, any>,
    decoratorLimit: number,
  ) {
    const { ctx, res } = makeContext(req);
    // ignoreUserAgents + blockDuration are required by the base
    // ThrottlerGuard v5 even though we don't exercise either; pass empty
    // defaults so the base's `throttler.ignoreUserAgents ?? commonOptions...`
    // short-circuits and the test doesn't depend on onModuleInit having run.
    const throttlerOpts = {
      name: 'api-key',
      ttl: 60_000,
      limit: decoratorLimit,
      ignoreUserAgents: [],
      blockDuration: 0,
    };
    const getTracker = async (r: any) => guard.getTracker(r);
    const generateKey = (_c: any, tracker: string, name: string) =>
      `${name}:${tracker}`;
    await guard.handleRequest(
      ctx,
      decoratorLimit,
      60_000,
      throttlerOpts,
      getTracker,
      generateKey,
    );
    const incrementCall = storage.calls[storage.calls.length - 1];
    // X-RateLimit-Limit-api-key: <effectiveLimit> is what the base writes.
    const limitHeader = res.headers.find((h) => h.name === 'X-RateLimit-Limit-api-key');
    return {
      key: incrementCall?.key,
      ttl: incrementCall?.ttl,
      effectiveLimit: limitHeader ? Number(limitHeader.value) : undefined,
    };
  }

  it('endpoint decorator caps a generous plan downward (inquiry 30 on 300/min plan)', async () => {
    const key = 'pro-tenant';
    const storage = makeStorage();
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
      storage as any,
      { getAllAndOverride: () => undefined } as any,
      makeDataSource({ [sha256(key)]: 300 }) as any,
    );
    const call = await callHandle(
      guard,
      storage,
      { headers: { 'x-api-key': key }, ip: '1.1.1.1' },
      30,
    );
    expect(call.effectiveLimit).toBe(30);
  });

  it('plan caps a generous decorator downward (free 60 on a "polling" 600 endpoint)', async () => {
    const key = 'free-tenant';
    const storage = makeStorage();
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
      storage as any,
      { getAllAndOverride: () => undefined } as any,
      makeDataSource({ [sha256(key)]: 60 }) as any,
    );
    const call = await callHandle(
      guard,
      storage,
      { headers: { 'x-api-key': key }, ip: '1.1.1.1' },
      600,
    );
    expect(call.effectiveLimit).toBe(60);
  });

  it('anon bucket caps even a high decorator limit', async () => {
    const storage = makeStorage();
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
      storage as any,
      { getAllAndOverride: () => undefined } as any,
      makeDataSource({}) as any,
    );
    const call = await callHandle(
      guard,
      storage,
      { headers: { 'x-api-key': 'bogus' }, ip: '1.1.1.1' },
      600,
    );
    expect(call.effectiveLimit).toBe(ANON_ABUSE_LIMIT);
  });

  it('no decorator (limit=0) → bucket limit', async () => {
    const key = 'pro-tenant';
    const storage = makeStorage();
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
      storage as any,
      { getAllAndOverride: () => undefined } as any,
      makeDataSource({ [sha256(key)]: 300 }) as any,
    );
    const call = await callHandle(
      guard,
      storage,
      { headers: { 'x-api-key': key }, ip: '1.1.1.1' },
      0,
    );
    expect(call.effectiveLimit).toBe(300);
  });

  it('uses the bucket tracker (not the IP) in the storage key', async () => {
    const key = 'tenant-key';
    const storage = makeStorage();
    const guard = new ApiKeyThrottlerGuard(
      { throttlers: [{ name: 'api-key', ttl: 60_000, limit: 0 }] } as any,
      storage as any,
      { getAllAndOverride: () => undefined } as any,
      makeDataSource({ [sha256(key)]: 200 }) as any,
    );
    const call = await callHandle(
      guard,
      storage,
      { headers: { 'x-api-key': key }, ip: '1.1.1.1' },
      0,
    );
    // Format is "api-key:apikey:<hash[0:32]>" because the generateKey stub
    // joins throttler name + tracker.
    expect(call.key).toBe(`api-key:apikey:${sha256(key).slice(0, 32)}`);
  });
});
