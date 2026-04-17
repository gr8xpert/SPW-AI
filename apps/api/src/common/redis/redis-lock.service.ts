import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

export const REDIS_LOCK_CLIENT = Symbol('REDIS_LOCK_CLIENT');

// Compare-and-delete release so a slow holder that overran its TTL can't
// accidentally delete a lock that a second replica has already re-acquired.
// The SET NX PX has TTL so crashed holders auto-release; this Lua makes
// *normal* release safe against that same race.
const RELEASE_LUA = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export interface LockOutcome<T> {
  acquired: boolean;
  result?: T;
}

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(@Inject(REDIS_LOCK_CLIENT) private readonly redis: Redis) {}

  // Attempts to acquire `key` for `ttlMs` via SET NX PX. If acquired, runs
  // `fn` and releases on completion (even if `fn` throws). If the lock is
  // already held, returns { acquired: false } without running `fn`. Redis
  // errors fail *closed* — we skip rather than risk two replicas running
  // work that might not be idempotent. Callers that treat duplicate work as
  // safe can retry manually after a Redis outage clears.
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<LockOutcome<T>> {
    const token = randomBytes(16).toString('hex');
    const prefixed = `lock:${key}`;
    let acquired = false;
    try {
      const result = await this.redis.set(prefixed, token, 'PX', ttlMs, 'NX');
      acquired = result === 'OK';
    } catch (err) {
      this.logger.error(
        `lock acquire failed for ${key}: ${(err as Error).message}`,
      );
      return { acquired: false };
    }
    if (!acquired) {
      return { acquired: false };
    }
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      try {
        await this.redis.eval(RELEASE_LUA, 1, prefixed, token);
      } catch (err) {
        // Best-effort release — worst case the TTL expires the key.
        this.logger.warn(
          `lock release failed for ${key}: ${(err as Error).message}`,
        );
      }
    }
  }

  onModuleDestroy(): void {
    void this.redis.quit().catch(() => {});
  }
}

// Dedicated ioredis client so a lock operation can't block on, or be blocked
// by, a throttler or BullMQ call. Same connection parameters as the other
// Redis clients in the app.
export function createRedisLockClient(configService: ConfigService): Redis {
  return new Redis({
    host: configService.get<string>('redis.host'),
    port: configService.get<number>('redis.port'),
    password: configService.get<string>('redis.password'),
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
