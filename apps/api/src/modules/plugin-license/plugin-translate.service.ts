import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import type Anthropic from '@anthropic-ai/sdk';
import { PluginCreditUsage, PluginLicense } from '../../database/entities';
import { AnthropicCallError, callAnthropic, estimateCostMicros } from '../ai/anthropic-client';
import { PluginLicenseService, pluginError } from './plugin-license.service';
import { countWords } from './plugin-plans';

// SPM AI credits: the plugin sends its translation batch here instead of to its own AI key. Words of
// the source items are reserved before the AI call (row lock, so parallel jobs can't overspend) and
// refunded if the call fails. Spend has its own monthly cap (PLUGIN_AI_MONTHLY_BUDGET_USD) so plugin
// traffic can never pause SPM's other AI features, which use ANTHROPIC_MONTHLY_BUDGET_USD.

export interface PluginTranslateRequest {
  license_key: string;
  site_url: string;
  plugin_version?: string;
  system: string;
  user: string;
  // Sent by the plugin but ignored: the server always uses TRANSLATIONS_SCHEMA (see below).
  schema?: Record<string, unknown>;
}

// The proxy only translates: the output schema is fixed here, the user message is rebuilt from the
// validated items, and output tokens are capped in proportion to the billed source text, so the
// endpoint can't be used as a general-purpose (unmetered) AI.
const TRANSLATIONS_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

/** Output budget for a batch: ~2x the source text in tokens, plus room for the JSON wrapper. */
export function outputTokenCap(items: Array<{ text: string }>): number {
  const chars = items.reduce((n, i) => n + i.text.length, 0);
  return Math.min(16_000, Math.max(256, Math.ceil(chars / 2) + 64 * items.length + 256));
}

@Injectable()
export class PluginTranslateService {
  private readonly logger = new Logger(PluginTranslateService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly licenses: PluginLicenseService,
    private readonly dataSource: DataSource,
    @InjectRepository(PluginCreditUsage) private readonly usage: Repository<PluginCreditUsage>,
  ) {}

  async translate(req: PluginTranslateRequest) {
    const license = await this.licenses.findByKey(req.license_key);
    this.licenses.assertUsable(license);
    await this.licenses.requireActivation(license, req.site_url);
    if (!license.wordsAllowed) {
      throw pluginError(HttpStatus.FORBIDDEN, 'not_credits_plan', 'This licence uses your own AI key. Add it in the plugin settings, or switch to an SPM AI credits plan.');
    }

    const items = parseItems(req.user);
    const words = countWords(items.map((i) => i.text));
    const { start } = this.licenses.creditPeriod(license);

    await this.guardBudget();
    await this.reserve(license, start, words);

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const model = (this.config.get<string>('PLUGIN_AI_MODEL') || 'claude-haiku-5-5').replace(/^anthropic\//, '');
    let message: Anthropic.Message;
    try {
      if (!apiKey) throw new AnthropicCallError('ANTHROPIC_API_KEY is not set', 'other');
      message = await callAnthropic(
        apiKey,
        model,
        outputTokenCap(items),
        { system: req.system, messages: [{ role: 'user', content: JSON.stringify({ items }) }] },
        120_000,
        1,
        { type: 'json_schema', schema: TRANSLATIONS_SCHEMA as unknown as Record<string, unknown> },
      );
    } catch (err) {
      await this.refund(license.id, start, words);
      this.logger.error(`Plugin translate failed for licence ${license.id}: ${(err as Error).message}`);
      throw pluginError(HttpStatus.BAD_GATEWAY, 'ai_unavailable', 'The SPM translation service is busy right now. Your credits were not used. Try again in a few minutes.');
    }

    const tokensIn =
      (message.usage.input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
    const tokensOut = message.usage.output_tokens ?? 0;
    const cost = estimateCostMicros(model, { inputTokens: tokensIn, outputTokens: tokensOut });
    await this.usage.increment({ licenseId: license.id, periodStart: start }, 'costMicros', cost);

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      result = null;
    }
    if (message.stop_reason !== 'end_turn' || !result || typeof result !== 'object') {
      await this.refund(license.id, start, words);
      const truncated = message.stop_reason === 'max_tokens';
      throw pluginError(
        truncated ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.BAD_GATEWAY,
        truncated ? 'too_long' : 'ai_invalid',
        truncated ? 'This batch is too long for one request. The plugin will retry with smaller batches.' : 'The translation came back incomplete. Your credits were not used. Try again.',
      );
    }

    return {
      result,
      usage: { words, tokens_in: tokensIn, tokens_out: tokensOut },
      credits: await this.licenses.creditsView(license),
    };
  }

  /** Reserve words in the current period, or 402 when the allowance would be exceeded. */
  private async reserve(license: PluginLicense, periodStart: Date, words: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PluginCreditUsage);
      await repo
        .createQueryBuilder()
        .insert()
        .values({ licenseId: license.id, periodStart, wordsUsed: 0, costMicros: '0' })
        .orIgnore()
        .execute();
      const row = await repo
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.licenseId = :id AND u.periodStart = :start', { id: license.id, start: periodStart })
        .getOneOrFail();
      const allowed = license.wordsAllowed ?? 0;
      if (row.wordsUsed + words > allowed) {
        const left = Math.max(0, allowed - row.wordsUsed);
        const resets = this.licenses.creditPeriod(license).resets.toISOString().slice(0, 10);
        throw pluginError(
          HttpStatus.PAYMENT_REQUIRED,
          'credits_exhausted',
          left > 0
            ? `This needs ${words.toLocaleString('en')} words but only ${left.toLocaleString('en')} are left this month. Credits reset on ${resets}, or upgrade your plan.`
            : `Your ${allowed.toLocaleString('en')} words for this month are used up. They reset on ${resets}, or upgrade your plan.`,
        );
      }
      await repo.update(row.id, { wordsUsed: row.wordsUsed + words });
    });
  }

  private async refund(licenseId: number, periodStart: Date, words: number): Promise<void> {
    await this.usage.decrement({ licenseId, periodStart }, 'wordsUsed', words);
  }

  /** Platform-wide monthly cap for plugin AI spend (USD); 0 or unset = no cap. */
  private async guardBudget(): Promise<void> {
    const budget = Number(this.config.get<string>('PLUGIN_AI_MONTHLY_BUDGET_USD') || 0);
    if (!budget) return;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const raw = await this.usage
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.costMicros), 0)', 'total')
      .where({ updatedAt: MoreThanOrEqual(monthStart) })
      .getRawOne<{ total: string }>();
    if (Number(raw?.total ?? 0) / 1e6 >= budget) {
      this.logger.error(`PLUGIN_AI_MONTHLY_BUDGET_USD (${budget}) reached: plugin translations paused`);
      throw pluginError(HttpStatus.SERVICE_UNAVAILABLE, 'service_paused', 'The SPM translation service is paused for maintenance. Your credits were not used. Please try again later.');
    }
  }
}

function parseItems(user: string): Array<{ id: string; text: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(user);
  } catch {
    parsed = null;
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items) || !items.length || items.length > 500) {
    throw pluginError(HttpStatus.BAD_REQUEST, 'invalid_request', 'The translation request is malformed.');
  }
  return items.map((i: any) => {
    const id = String(i?.id ?? '');
    if (!/^[\w-]{1,20}$/.test(id) || typeof i?.text !== 'string') {
      throw pluginError(HttpStatus.BAD_REQUEST, 'invalid_request', 'The translation request is malformed.');
    }
    // Only id and text are forwarded; anything else in the item is dropped.
    return { id, text: i.text };
  });
}
