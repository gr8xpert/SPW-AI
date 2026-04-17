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

// Dedicated throttler tier for public API endpoints keyed by tenant API key.
// A shared/proxied IP (CDN, office NAT) would otherwise make one noisy tenant
// starve every other tenant behind that IP under the global IP-based bucket.
// Scoping by api-key gives each tenant its own budget, sized by their plan's
// ratePerMinute column (60/min fallback for anonymous / unknown keys).
const API_KEY_THROTTLER = {
  name: 'api-key' as const,
  ttl: 60_000,
  // Limit is 0 here because the real value is resolved per-request from the
  // tenant's plan in handleRequest(). A controller that wants to *floor* the
  // effective rate (e.g. /sync-meta polling) declares @Throttle({ 'api-key':
  // { limit: N } }) explicitly — that becomes a minimum, not a ceiling.
  limit: 0,
};

const DEFAULT_LIMIT = 60;
// Short TTL on the tenant→limit lookup so a plan change propagates within a
// minute without requiring the API to restart, but hot tenants don't hit the
// DB on every request. 30s is a compromise: at ~600 req/min that's ~1 lookup
// per tenant per 300 requests.
const LIMIT_CACHE_TTL_MS = 30_000;

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ApiKeyThrottlerGuard.name);
  private readonly limitCache: Map<string, { limit: number; expiresAt: number }> =
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

  // Track by the raw x-api-key header (sha256'd so we don't stash secrets in
  // the throttler storage). Falls back to IP for anonymous callers — they'll
  // also be caught by whatever auth check the controller runs, but having a
  // tracker here prevents an unauthenticated flood from going un-counted.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const raw = req?.headers?.['x-api-key'];
    if (typeof raw === 'string' && raw.length > 0) {
      return `apikey:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
    }
    return `ip:${req?.ip ?? 'unknown'}`;
  }

  // Per-request override of the static decorator limit. Resolves the tenant's
  // plan.ratePerMinute for authenticated callers; anonymous / unknown keys
  // fall back to the default so a probe flood still hits a ceiling.
  //
  // When the controller decorator supplies a higher limit (e.g. 600/min for
  // /sync-meta polling), we respect the max of plan-vs-decorator so upgrading
  // a plan doesn't accidentally lower a polling endpoint's ceiling.
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
    const resolved =
      typeof rawKey === 'string' && rawKey.length > 0
        ? await this.resolveLimitForApiKey(rawKey)
        : DEFAULT_LIMIT;

    // Honor whichever ceiling is higher: the plan's allowance, or the
    // controller's explicit @Throttle decorator. /sync-meta sets 600 to
    // accommodate widget polling; we don't want a Free tenant's 30/min cap
    // to break that.
    const effectiveLimit = Math.max(resolved, limit);
    return super.handleRequest(
      context,
      effectiveLimit,
      ttl,
      throttler,
      getTracker,
      generateKey,
    );
  }

  private async resolveLimitForApiKey(rawKey: string): Promise<number> {
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const now = Date.now();

    const cached = this.limitCache.get(hash);
    if (cached && cached.expiresAt > now) {
      return cached.limit;
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

      const limit =
        row && row.ratePerMinute != null ? Number(row.ratePerMinute) : DEFAULT_LIMIT;
      this.limitCache.set(hash, { limit, expiresAt: now + LIMIT_CACHE_TTL_MS });
      return limit;
    } catch (err) {
      this.logger.warn(
        `rate-limit lookup failed, falling back to default ${DEFAULT_LIMIT}/min: ${
          (err as Error).message
        }`,
      );
      return DEFAULT_LIMIT;
    }
  }
}
