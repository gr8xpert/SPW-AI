import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

interface CacheKeyParts {
  tenantId: number;
  reference: string;
  updatedAt: Date;
  lang: string;
  variant: 'branded' | 'unbranded';
}

/**
 * In-memory LRU for rendered brochure PDFs. No disk persistence — Chrome+template
 * regenerates a missing entry in ~1-2s, so cache is purely a hot-path
 * optimization. Cache key bakes in `property.updatedAt` so a tenant edit
 * auto-invalidates the entry on next request (no manual purge needed).
 *
 * Capacity tuned for ~250MB peak (500 entries × ~500KB avg PDF). TTL bounded
 * at 1h so tenant-level edits (logo swap, label change) propagate without
 * waiting for property changes.
 */
@Injectable()
export class BrochureCacheService {
  private readonly logger = new Logger(BrochureCacheService.name);
  private readonly cache = new LRUCache<string, Buffer>({
    max: 500,
    ttl: 60 * 60 * 1000,
    updateAgeOnGet: false,
  });

  private buildKey(parts: CacheKeyParts): string {
    return `${parts.tenantId}:${parts.reference}:${parts.updatedAt.getTime()}:${parts.lang}:${parts.variant}`;
  }

  get(parts: CacheKeyParts): Buffer | undefined {
    return this.cache.get(this.buildKey(parts));
  }

  set(parts: CacheKeyParts, pdf: Buffer): void {
    this.cache.set(this.buildKey(parts), pdf);
  }

  clearAll(): void {
    this.cache.clear();
    this.logger.log('Brochure cache cleared');
  }
}
