import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { RedisLockService } from '../../common/redis/redis-lock.service';

// What the Feed Export run buttons share. A feed run by hand goes through the
// same code a reader or the schedule uses; this only adds the guards.

// Per route, on top of the one-run-at-a-time lock.
export const MANUAL_RUN_THROTTLE = { default: { limit: 6, ttl: 60_000 } };

const URL_FEED_RUN_TTL_MS = 5 * 60_000;

export type UrlFeedName = 'xml' | 'json' | 'idealista';

// Refuses, rather than silently skips, when a run is going: the dashboard shows it.
export function assertLockAcquired(outcome: { acquired: boolean; error?: boolean }): void {
  if (outcome.error) throw new ServiceUnavailableException('Could not start the run. Please try again.');
  if (!outcome.acquired) throw new ConflictException('A run is already going');
}

export async function runUrlFeedOnce<T>(
  lock: RedisLockService,
  feed: UrlFeedName,
  tenantId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const outcome = await lock.withLock(`feed-export:run:${feed}:${tenantId}`, URL_FEED_RUN_TTL_MS, fn);
  assertLockAcquired(outcome);
  return outcome.result as T;
}

// The result of generating a URL feed by hand. Nothing is sent to anyone.
export interface UrlFeedRunResult {
  listings: number;
  skipped: number;
}
