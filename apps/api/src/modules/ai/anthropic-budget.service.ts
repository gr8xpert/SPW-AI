import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_THROTTLER_CLIENT } from '../../common/throttler/redis-throttler.storage';
import { AnthropicUsage, estimateCostMicros, platformAnthropicModel } from './anthropic-client';

const DEFAULT_BUDGET_USD = 190;
// How long the platform stays on OpenRouter after Anthropic says the key is
// bad or the credit is gone, before trying Anthropic again.
const BLOCK_SECONDS = 60 * 60;

const month = () => new Date().toISOString().slice(0, 7);
const spendKey = () => `ai:anthropic:spend:${month()}`;
const BLOCK_KEY = 'ai:anthropic:blocked';

export interface PlatformAiStatus {
  // Which account platform AI work goes to right now.
  active: 'anthropic' | 'openrouter' | 'none';
  anthropic: {
    configured: boolean;
    model: string;
    month: string;
    spentUsd: number;
    budgetUsd: number;
    // Why Anthropic is skipped right now, if it is.
    paused: 'budget' | 'credits' | 'auth' | null;
  };
  openrouterConfigured: boolean;
}

// Keeps platform AI on the Anthropic credit (ANTHROPIC_API_KEY) until this
// month's estimated spend reaches ANTHROPIC_MONTHLY_BUDGET_USD, then hands
// it to OpenRouter. Counts live in Redis so both API processes share them;
// if Redis is down, Anthropic stays in use and its own credit errors still
// switch us over.
@Injectable()
export class AnthropicBudgetService {
  private readonly logger = new Logger(AnthropicBudgetService.name);

  constructor(@Optional() @Inject(REDIS_THROTTLER_CLIENT) private readonly redis?: Redis) {}

  configured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  budgetMicros(): number {
    const usd = Number(process.env.ANTHROPIC_MONTHLY_BUDGET_USD);
    return Math.round((Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_BUDGET_USD) * 1_000_000);
  }

  async spentMicros(): Promise<number> {
    if (!this.redis) return 0;
    try {
      return Number(await this.redis.get(spendKey())) || 0;
    } catch (err) {
      this.logger.warn(`Reading Anthropic spend failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async pausedFor(): Promise<PlatformAiStatus['anthropic']['paused']> {
    if (!this.redis) return null;
    try {
      const blocked = await this.redis.get(BLOCK_KEY);
      if (blocked === 'credits' || blocked === 'auth') return blocked;
    } catch {
      return null;
    }
    return (await this.spentMicros()) >= this.budgetMicros() ? 'budget' : null;
  }

  /** Whether platform work should go to Anthropic right now. */
  async available(): Promise<boolean> {
    return this.configured() && !(await this.pausedFor());
  }

  async record(model: string, usage: AnthropicUsage): Promise<void> {
    if (!this.redis) return;
    const micros = estimateCostMicros(model, usage);
    if (micros <= 0) return;
    try {
      const key = spendKey();
      const total = await this.redis.incrby(key, micros);
      // Kept a while past the month so last month's figure can be checked.
      await this.redis.expire(key, 60 * 60 * 24 * 62);
      if (total >= this.budgetMicros() && total - micros < this.budgetMicros()) {
        this.logger.warn(`Anthropic monthly budget reached ($${(total / 1e6).toFixed(2)}); platform AI moves to OpenRouter until next month`);
      }
    } catch (err) {
      this.logger.warn(`Recording Anthropic spend failed: ${(err as Error).message}`);
    }
  }

  async pause(reason: 'credits' | 'auth'): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(BLOCK_KEY, reason, 'EX', BLOCK_SECONDS);
    } catch (err) {
      this.logger.warn(`Pausing Anthropic failed: ${(err as Error).message}`);
    }
  }

  async status(): Promise<PlatformAiStatus> {
    const configured = this.configured();
    const paused = configured ? await this.pausedFor() : null;
    const openrouterConfigured = !!process.env.OPENROUTER_API_KEY;
    return {
      active: configured && !paused ? 'anthropic' : openrouterConfigured ? 'openrouter' : 'none',
      anthropic: {
        configured,
        model: platformAnthropicModel(),
        month: month(),
        spentUsd: Math.round((await this.spentMicros()) / 10_000) / 100,
        budgetUsd: this.budgetMicros() / 1_000_000,
        paused,
      },
      openrouterConfigured,
    };
  }
}
