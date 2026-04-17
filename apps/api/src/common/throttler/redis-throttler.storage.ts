import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

export const REDIS_THROTTLER_CLIENT = Symbol('REDIS_THROTTLER_CLIENT');

// A Lua script keeps the bucket math atomic: INCR, set TTL on first hit,
// then read remaining PTTL — all in a single round trip to Redis. Two
// separate commands would race under load: two concurrent increments could
// both see count=1 and both try to PEXPIRE, or a tenant on the edge of the
// TTL window could observe a PTTL of -1 between INCR and PEXPIRE.
const INCREMENT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  local pttl = redis.call('PTTL', KEYS[1])
  return { current, pttl }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private scriptSha: string | null = null;

  constructor(
    @Inject(REDIS_THROTTLER_CLIENT) private readonly redis: Redis,
  ) {}

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const prefixed = `throttler:${key}`;
    try {
      const result = await this.evalScript(prefixed, ttl);
      const [totalHits, pttlMs] = result;
      // ThrottlerGuard expects seconds remaining. If Redis returned -1 it
      // means no TTL was set (shouldn't happen — we just wrote one) so
      // fall back to the input ttl. -2 means the key disappeared; treat
      // as a fresh bucket.
      const timeToExpire =
        pttlMs > 0 ? Math.ceil(pttlMs / 1000) : Math.ceil(ttl / 1000);
      return { totalHits, timeToExpire };
    } catch (err) {
      // A Redis outage must not hard-fail every request. Log and fall open
      // with a single hit so the caller still gets a 200 — the global IP
      // throttler elsewhere acts as a safety net for that request.
      this.logger.error(`redis throttler increment failed: ${(err as Error).message}`);
      return { totalHits: 1, timeToExpire: Math.ceil(ttl / 1000) };
    }
  }

  onModuleDestroy(): void {
    // Don't force-quit — the ioredis client is shared with BullMQ under the
    // hood? No, this is our own dedicated client. Close cleanly on shutdown.
    void this.redis.quit().catch(() => {});
  }

  private async evalScript(key: string, ttl: number): Promise<[number, number]> {
    // Cache the script SHA once; Redis EVALSHA is cheaper than EVAL on every
    // call. If the script is flushed (EVALSHA returns NOSCRIPT), we fall back
    // to EVAL which re-caches the sha.
    try {
      if (this.scriptSha) {
        return (await this.redis.evalsha(
          this.scriptSha,
          1,
          key,
          ttl,
        )) as [number, number];
      }
    } catch (err) {
      if (!((err as Error).message || '').includes('NOSCRIPT')) {
        throw err;
      }
      this.scriptSha = null;
    }
    const sha = (await this.redis.script('LOAD', INCREMENT_LUA)) as string;
    this.scriptSha = sha;
    return (await this.redis.evalsha(sha, 1, key, ttl)) as [number, number];
  }
}

// Factory used by ThrottlerModule — we build a dedicated ioredis connection
// for throttling so a slow Redis op on BullMQ can't block rate-limit checks.
export function createRedisThrottlerClient(configService: ConfigService): Redis {
  return new Redis({
    host: configService.get<string>('redis.host'),
    port: configService.get<number>('redis.port'),
    password: configService.get<string>('redis.password'),
    // Small reconnect budget — we'd rather fail-open on the storage and let
    // the global IP throttler catch anomalies than stall requests on retry.
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    keyPrefix: '', // keys already include 'throttler:' from the storage class
  });
}
