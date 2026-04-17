import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Tenant } from '../../database/entities';
import { REDIS_THROTTLER_CLIENT } from '../../common/throttler/redis-throttler.storage';

// 5S — rate-limit headroom dashboard. Reads current 60s-window usage per
// tenant from the throttler storage, divides by the tenant's plan-derived
// ceiling, and returns sorted rows so a human can see "is anyone about to
// get 429'd?" at a glance. This is observability on top of the existing
// ApiKeyThrottlerGuard — we never mutate the counters.

const TRACKER_HASH_LEN = 32; // ApiKeyThrottlerGuard slices apiKeyHash to 32 hex chars
const DEFAULT_LIMIT_FALLBACK = 60;

// One row per tenant. ratePerMinute is the ceiling ApiKeyThrottlerGuard
// will actually enforce; currentUsage is the sum across all throttler keys
// matching this tenant's tracker (the guard may create multiple per
// endpoint-context).
export interface RateLimitHeadroomRow {
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  planName: string | null;
  ratePerMinute: number;
  currentUsage: number;
  headroomPercent: number;
  // Crude banding for the UI — so the dashboard doesn't need to repeat
  // thresholds on the client side.
  status: 'ok' | 'warning' | 'critical';
}

@Injectable()
export class RateLimitHeadroomService {
  private readonly logger = new Logger(RateLimitHeadroomService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @Inject(REDIS_THROTTLER_CLIENT)
    private readonly redis: Redis,
  ) {}

  async getHeadroom(): Promise<RateLimitHeadroomRow[]> {
    // Pull active tenants joined with plan.ratePerMinute — same schema the
    // ApiKeyThrottlerGuard consults at request time. Inactive tenants are
    // excluded; they can't make requests so their headroom row is
    // meaningless. Raw query keeps this lightweight and sidesteps having
    // to declare the Plan relation on the Tenant entity here.
    const rows: Array<{
      id: number;
      name: string;
      slug: string;
      planName: string | null;
      ratePerMinute: number | string | null;
      apiKeyHash: string;
    }> = await this.tenantRepo
      .createQueryBuilder('t')
      .innerJoin('plans', 'p', 'p.id = t.planId')
      .where('t.isActive = :active', { active: true })
      .select([
        't.id AS id',
        't.name AS name',
        't.slug AS slug',
        't.apiKeyHash AS apiKeyHash',
        'p.name AS planName',
        'p.ratePerMinute AS ratePerMinute',
      ])
      .getRawMany();

    const result: RateLimitHeadroomRow[] = [];
    for (const row of rows) {
      const tracker = `apikey:${row.apiKeyHash.slice(0, TRACKER_HASH_LEN)}`;
      const usage = await this.sumTrackerKeys(tracker);
      const limit =
        row.ratePerMinute != null
          ? Number(row.ratePerMinute)
          : DEFAULT_LIMIT_FALLBACK;
      const headroomPercent =
        limit > 0 ? Math.max(0, ((limit - usage) / limit) * 100) : 100;
      result.push({
        tenantId: row.id,
        tenantName: row.name,
        tenantSlug: row.slug,
        planName: row.planName,
        ratePerMinute: limit,
        currentUsage: usage,
        headroomPercent,
        status: this.classify(headroomPercent),
      });
    }

    // Busiest tenants first — ops usually want "who's about to hit their
    // ceiling" not "who's idle". Ties by percentage break by absolute
    // usage so a tenant with a higher cap bubbles up when the headroom
    // tie-breaks against a low-cap tenant.
    result.sort((a, b) => {
      if (a.headroomPercent !== b.headroomPercent) {
        return a.headroomPercent - b.headroomPercent;
      }
      return b.currentUsage - a.currentUsage;
    });

    return result;
  }

  // Sums the INCR counters across every throttler key whose generated-key
  // string contains our tracker. Nest's ThrottlerGuard includes the
  // tracker in its generateKey hash/suffix pattern; we SCAN and pick out
  // matches so any endpoint-context the guard may have sharded to is
  // aggregated here.
  private async sumTrackerKeys(tracker: string): Promise<number> {
    // SCAN (not KEYS) so a big throttler keyspace doesn't block Redis —
    // KEYS is O(N) on the entire keyspace and blocks the single-threaded
    // server during the walk. COUNT=200 is a compromise between round-trip
    // count and per-call work.
    const pattern = `throttler:*${tracker}*`;
    let cursor = '0';
    let total = 0;
    try {
      do {
        const [next, batch] = (await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          '200',
        )) as [string, string[]];
        cursor = next;
        if (batch.length > 0) {
          const values = (await this.redis.mget(batch)) as Array<
            string | null
          >;
          for (const v of values) {
            if (v) total += Number(v) || 0;
          }
        }
      } while (cursor !== '0');
    } catch (err) {
      // Redis hiccup during SCAN shouldn't poison the whole response —
      // fall back to 0 usage for this tenant with a log so ops can see
      // why one row shows empty.
      this.logger.warn(
        `SCAN failed for tracker ${tracker}: ${(err as Error).message}`,
      );
    }
    return total;
  }

  private classify(headroomPercent: number): 'ok' | 'warning' | 'critical' {
    if (headroomPercent <= 10) return 'critical';
    if (headroomPercent <= 30) return 'warning';
    return 'ok';
  }
}
