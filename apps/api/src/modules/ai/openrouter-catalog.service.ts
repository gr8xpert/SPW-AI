import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface CatalogModel {
  id: string;
  name: string;
  // USD per million tokens.
  inputPrice: number;
  outputPrice: number;
}

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

// OpenRouter's public model list (no key needed), cached for a few hours.
// OpenRouter retires model IDs over time; a request naming a retired one fails
// outright, so callers check here first and swap in a working model.
// When the catalog can't be fetched every model is treated as available —
// an outage of this list must never block AI features.
@Injectable()
export class OpenRouterCatalogService {
  private readonly logger = new Logger(OpenRouterCatalogService.name);
  private models: Map<string, CatalogModel> | null = null;
  private fetchedAt = 0;
  private failedAt = 0;
  private inFlight: Promise<void> | null = null;

  async get(): Promise<Map<string, CatalogModel> | null> {
    const now = Date.now();
    const stale = !this.models || now - this.fetchedAt > TTL_MS;
    const cooling = now - this.failedAt < RETRY_AFTER_FAILURE_MS;
    if (stale && !cooling) {
      this.inFlight ??= this.refresh().finally(() => {
        this.inFlight = null;
      });
      await this.inFlight;
    }
    return this.models;
  }

  // True when available or when availability can't be determined.
  async isAvailable(modelId: string): Promise<boolean> {
    const models = await this.get();
    return !models || models.has(modelId);
  }

  private async refresh(): Promise<void> {
    try {
      const res = await axios.get(CATALOG_URL, { timeout: 10_000 });
      const list: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
      if (!list.length) throw new Error('empty model list');
      this.models = new Map(
        list.map((m) => [
          String(m.id),
          {
            id: String(m.id),
            name: String(m.name || m.id),
            inputPrice: Number(m.pricing?.prompt || 0) * 1e6,
            outputPrice: Number(m.pricing?.completion || 0) * 1e6,
          },
        ]),
      );
      this.fetchedAt = Date.now();
    } catch (err) {
      this.failedAt = Date.now();
      this.logger.warn(`OpenRouter model list unavailable: ${(err as Error).message}`);
    }
  }
}
