import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';

// Dedicated throttler tier for public API endpoints keyed by tenant API key.
// A shared/proxied IP (CDN, office NAT) would otherwise make one noisy tenant
// starve every other tenant behind that IP under the global IP-based bucket.
// Scoping by api-key gives each tenant its own 60/min budget.
const API_KEY_THROTTLER = {
  name: 'api-key' as const,
  ttl: 60_000,
  limit: 60,
};

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
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
}
