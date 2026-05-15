import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerGetTrackerFunction,
  ThrottlerGenerateKeyFunction,
} from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

// Throttler tier for public widget endpoints (/api/v1/*). Two tracker shapes:
//
//   - Recognised tenant API key  →  `apikey:<sha256>` bucket sized by plan
//                                   (plan.ratePerMinute), capped further by
//                                   any @Throttle decorator on the route.
//   - Missing / unrecognised key →  shared `apikey:_anon` bucket with a
//                                   tight abuse limit. CRITICAL: collapsing
//                                   all unknown keys into one bucket stops
//                                   the obvious attack of rotating bogus
//                                   keys to get fresh 60/min budgets.
const API_KEY_THROTTLER = {
  name: 'api-key' as const,
  ttl: 60_000,
  // Effective limit is computed per-request in handleRequest(); the static
  // value here is only a fallback if our compute path throws.
  limit: 0,
};

// Anonymous / unrecognised callers all share this single bucket per minute.
// Sized to absorb a small amount of "warming up" traffic from a tenant whose
// API key was just rotated, but tight enough that brute-force key rotation
// becomes pointless.
export const ANON_ABUSE_LIMIT = 30;

const DEFAULT_TENANT_LIMIT = 60;
const LIMIT_CACHE_TTL_MS = 30_000;

// Bounded LRU for the api-key → bucket lookup. Without an upper limit, an
// attacker sending a stream of distinct bogus keys would inflate the cache
// unboundedly even though every entry resolves to the shared anon bucket.
// 10k entries × ~200B each ≈ 2 MB worst-case footprint.
const MAX_CACHE_ENTRIES = 10_000;

// Per-IP guard against burning DB cycles with random-key flooding. Each
// previously-unseen api-key costs one DB lookup; if a single source IP causes
// MORE than this many cache misses in the window, we stop doing the DB lookup
// for that IP and short-circuit to the anon bucket. The anon throttler bucket
// itself then enforces the 30/min cap.
//
// In other words: an attacker can do at most this-many DB-lookup probes per
// IP per window before being routed to anon without DB cost. Sized so a
// real tenant rolling out a fleet (~50 unique cached keys/min/IP) doesn't trip.
const MAX_UNKNOWN_PROBES_PER_IP = 50;
const UNKNOWN_PROBE_WINDOW_MS = 60_000;

interface KeyResolution {
  // Stable identifier used as the throttler bucket tracker. Always begins
  // with "apikey:" so it can't collide with the global IP tier's "ip:" namespace.
  tracker: string;
  // Per-minute allowance for this bucket BEFORE the route-level @Throttle
  // ceiling is applied.
  limit: number;
  valid: boolean;
}

// Sentinel returned by resolveKey for the anon path. Hoisted to a frozen
// constant so all anon results === ANON_RESOLUTION — useful for === checks
// in tests and to avoid allocating a fresh object per request.
const ANON_RESOLUTION: KeyResolution = Object.freeze({
  tracker: 'apikey:_anon',
  limit: ANON_ABUSE_LIMIT,
  valid: false,
});

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ApiKeyThrottlerGuard.name);
  // Bounded LRU: when full, oldest entry is evicted (Map preserves insertion order).
  private readonly cache: Map<string, { resolution: KeyResolution; expiresAt: number }> =
    new Map();
  // Per-IP miss counter for the DB-pre-check.
  private readonly probeCounters: Map<string, { count: number; resetAt: number }> =
    new Map();

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(options, storageService, reflector);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    // Replace the inherited throttler list with our single public-API tier.
    // Without this, the base class would also enforce default/short/medium/long
    // here — a second time after the global ThrottlerGuard already ran — which
    // would either double-bill storage or cause confusing 429s keyed by IP.
    (this as unknown as { throttlers: Array<typeof API_KEY_THROTTLER> }).throttlers = [
      API_KEY_THROTTLER,
    ];
  }

  // Tracker = the bucket name. Recognised key → its own bucket; anything else
  // → the shared anon bucket. The lookup is cached for 30s so the DB isn't
  // hit on every request.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const raw = req?.headers?.['x-api-key'];
    const sourceIp = this.extractIp(req);
    const resolution = await this.resolveKey(
      typeof raw === 'string' ? raw : undefined,
      sourceIp,
    );
    return resolution.tracker;
  }

  // handleRequest is where the effective limit is set. We take the bucket's
  // own allowance (anon = ANON_ABUSE_LIMIT; valid = plan.ratePerMinute) and
  // bound it from above by the @Throttle decorator's limit, if any. So an
  // endpoint that declares `@Throttle({ 'api-key': { limit: 30 } })` gets at
  // most 30/min — Math.min, not Math.max. The previous Math.max wording made
  // those decorators a floor (useless), which the corrective pass is fixing.
  //
  // Decorator absent (or limit <= 0) → no upper bound beyond the bucket's
  // intrinsic allowance.
  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const { req } = this.getRequestResponse(context) as { req: Record<string, any> };
    const rawKey = req?.headers?.['x-api-key'];
    const sourceIp = this.extractIp(req);
    const resolution = await this.resolveKey(
      typeof rawKey === 'string' ? rawKey : undefined,
      sourceIp,
    );

    const decoratorLimit = Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY;
    const effectiveLimit = Math.min(resolution.limit, decoratorLimit);

    return super.handleRequest(
      context,
      effectiveLimit,
      ttl,
      throttler,
      getTracker,
      generateKey,
    );
  }

  // Resolves a raw key (or missing key) to a tracker + limit. Memoised by
  // sha256(key); the anon path is hoisted to a frozen sentinel.
  //
  // Two flooding defences sit in front of the DB lookup:
  //   1. Bounded LRU. We never let the cache grow past MAX_CACHE_ENTRIES.
  //   2. Per-IP probe counter. If a single IP has already caused
  //      MAX_UNKNOWN_PROBES_PER_IP cache misses inside the rolling window,
  //      we route it to anon WITHOUT consulting the DB.
  //
  // Made `protected` so tests can drive it directly without `as any` casts.
  protected async resolveKey(
    rawKey: string | undefined,
    sourceIp: string | null = null,
  ): Promise<KeyResolution> {
    if (!rawKey || rawKey.length === 0) {
      return ANON_RESOLUTION;
    }

    const hash = createHash('sha256').update(rawKey).digest('hex');
    const now = Date.now();
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > now) {
      // Touch the entry so LRU keeps frequently-used keys hot.
      this.cache.delete(hash);
      this.cache.set(hash, cached);
      return cached.resolution;
    }

    // Pre-DB guard: if this IP is over its unknown-probe budget for the
    // window, skip the lookup and let the anon throttler bucket finish the
    // job. This is the only place we can absorb a flood-with-fresh-keys
    // attack without burning a DB cycle per attempt.
    if (sourceIp && this.isProbeBudgetExceeded(sourceIp, now)) {
      return ANON_RESOLUTION;
    }

    try {
      const row = await this.dataSource
        .createQueryBuilder()
        .select('p.ratePerMinute', 'ratePerMinute')
        .from('tenants', 't')
        .innerJoin('plans', 'p', 'p.id = t.planId')
        .where('t.apiKeyHash = :hash', { hash })
        .andWhere('t.isActive = :active', { active: true })
        .getRawOne<{ ratePerMinute: number | string }>();

      let resolution: KeyResolution;
      if (row && row.ratePerMinute != null) {
        resolution = {
          tracker: `apikey:${hash.slice(0, 32)}`,
          limit: Number(row.ratePerMinute) || DEFAULT_TENANT_LIMIT,
          valid: true,
        };
      } else {
        // Unknown key. Increment the IP's probe counter so a flood doesn't
        // keep hitting the DB even with the cache in place — distinct keys
        // each take one DB lookup the first time they're seen.
        if (sourceIp) this.incrementProbeCounter(sourceIp, now);
        resolution = ANON_RESOLUTION;
      }
      this.writeCache(hash, resolution, now);
      return resolution;
    } catch (err) {
      this.logger.warn(
        `rate-limit lookup failed, treating as anon (${(err as Error).message})`,
      );
      // Fail closed (anon bucket) on DB errors so we don't accidentally give
      // an attacker an open budget while the DB is degraded.
      return ANON_RESOLUTION;
    }
  }

  // Bounded LRU insert. When the cache is at capacity we evict the oldest
  // entry (Map iteration order = insertion order; first key is oldest).
  private writeCache(hash: string, resolution: KeyResolution, now: number): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(hash, { resolution, expiresAt: now + LIMIT_CACHE_TTL_MS });
  }

  private isProbeBudgetExceeded(ip: string, now: number): boolean {
    const entry = this.probeCounters.get(ip);
    if (!entry || entry.resetAt <= now) return false;
    return entry.count >= MAX_UNKNOWN_PROBES_PER_IP;
  }

  private incrementProbeCounter(ip: string, now: number): void {
    const entry = this.probeCounters.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.probeCounters.set(ip, { count: 1, resetAt: now + UNKNOWN_PROBE_WINDOW_MS });
      // Opportunistic GC: when we add a new entry, also evict anything
      // expired so the map can't grow unboundedly even on a wide-spread DDoS.
      if (this.probeCounters.size > 1024) {
        for (const [k, v] of this.probeCounters) {
          if (v.resetAt <= now) this.probeCounters.delete(k);
        }
      }
      return;
    }
    entry.count++;
  }

  private extractIp(req: Record<string, any>): string | null {
    const ip = req?.ip ?? req?.socket?.remoteAddress;
    return typeof ip === 'string' && ip.length > 0 ? ip : null;
  }
}

// Test-only export: re-exposes the internal tunables so the spec can pin
// the contract (size of LRU, anon limit, probe budget) without parsing
// magic numbers from assertions. NOT for production consumption.
export const __throttlerInternals = {
  MAX_CACHE_ENTRIES,
  MAX_UNKNOWN_PROBES_PER_IP,
  UNKNOWN_PROBE_WINDOW_MS,
  LIMIT_CACHE_TTL_MS,
};
