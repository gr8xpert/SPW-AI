import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Tenant } from '../../database/entities';
import { FALLBACK_DEFAULT_MODEL, FALLBACK_ENRICHMENT_MODEL, RECOMMENDED_MODELS } from './ai-models';
import { OpenRouterCatalogService } from './openrouter-catalog.service';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Default model is read from env so operators can swap to a newer Claude/GPT
// release without a code change. Fallback (the hardcoded constant below)
// only kicks in when neither tenant settings nor env are set; treat the
// fallback as a "known-good last resort" rather than a recommended default.
//
// Update process: change OPENROUTER_DEFAULT_MODEL in production .env, restart
// API. No DB migration required. A model OpenRouter has retired is swapped
// for a working one at request time (see usableModel), so a stale setting
// degrades to the default instead of failing.
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || FALLBACK_DEFAULT_MODEL;

// Cheap, accurate model for structured classification work (location
// hierarchy filling, feature categorisation). Used by the enrichment
// service via { model: ENRICHMENT_MODEL }.
export const ENRICHMENT_MODEL =
  process.env.OPENROUTER_ENRICHMENT_MODEL || FALLBACK_ENRICHMENT_MODEL;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface StreamEvent {
  type: 'delta' | 'tool_calls' | 'done' | 'error';
  content?: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  error?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private readonly catalog: OpenRouterCatalogService,
  ) {}

  // The requested model if OpenRouter still offers it, else the first of the
  // defaults that it does. Logged once per retired model.
  private readonly warnedRetired = new Set<string>();
  async usableModel(requested: string): Promise<string> {
    if (await this.catalog.isAvailable(requested)) return requested;
    for (const candidate of [DEFAULT_MODEL, FALLBACK_DEFAULT_MODEL, ...RECOMMENDED_MODELS.map((m) => m.id)]) {
      if (candidate !== requested && (await this.catalog.isAvailable(candidate))) {
        if (!this.warnedRetired.has(requested)) {
          this.warnedRetired.add(requested);
          this.logger.warn(`OpenRouter no longer offers "${requested}"; using "${candidate}" instead`);
        }
        return candidate;
      }
    }
    return requested;
  }

  // Settings → AI: the recommended models OpenRouter currently offers, with
  // prices, plus what the tenant has saved and whether it still works.
  async listModels(tenantId: number) {
    const models = await this.catalog.get();
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    const saved: string | null = tenant?.settings?.openRouterModel || null;
    const offered = RECOMMENDED_MODELS.filter((m) => !models || models.has(m.id)).map((m) => ({
      ...m,
      inputPrice: models?.get(m.id)?.inputPrice ?? null,
      outputPrice: models?.get(m.id)?.outputPrice ?? null,
    }));
    return {
      models: offered,
      saved,
      savedAvailable: saved ? await this.catalog.isAvailable(saved) : true,
      savedName: saved ? models?.get(saved)?.name ?? null : null,
      effective: await this.usableModel(saved || DEFAULT_MODEL),
    };
  }

  async chatCompletion(
    tenantId: number,
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      // Bill the platform key when the tenant hasn't configured their own.
      // Opt-in per caller: interactive features want the "add your key"
      // error, while platform-run work (bulk SEO, enrichment) should keep
      // working for tenants who never set one up.
      allowPlatformKey?: boolean;
    },
  ): Promise<string> {
    // Single source of truth for key resolution — reads the encrypted column
    // first (post-5Q split), falls back to the legacy settings JSON for any
    // tenant row not yet through the data migration.
    const { apiKey, model: resolvedModel } = await this.resolveKeyAndModel(
      tenantId,
      options?.model,
      options?.allowPlatformKey === true,
    );
    const model = resolvedModel;

    try {
      const response = await axios.post(
        OPENROUTER_URL,
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 4096,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://spm.app',
            'X-Title': 'SPM Property Manager',
          },
          timeout: 60_000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter');
      }
      return content;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        if (status === 401) {
          throw new BadRequestException('OpenRouter API key is invalid. Check your key in Settings → AI.');
        }
        if (status === 402) {
          throw new BadRequestException('OpenRouter account has insufficient credits.');
        }
        this.logger.error(`OpenRouter API error (${status}): ${msg}`);
        throw new BadRequestException(`AI request failed: ${msg}`);
      }
      throw err;
    }
  }

  async chatCompletionWithTools(
    tenantId: number,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const { apiKey, model } = await this.resolveKeyAndModel(tenantId, options?.model);

    try {
      const body: Record<string, any> = {
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
      };
      if (tools?.length) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const response = await axios.post(OPENROUTER_URL, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://spm.app',
          'X-Title': 'SPM Property Manager',
        },
        timeout: 120_000,
      });

      const choice = response.data?.choices?.[0];
      const usage = response.data?.usage || {};

      return {
        content: choice?.message?.content || null,
        toolCalls: choice?.message?.tool_calls || [],
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        if (status === 401) throw new BadRequestException('OpenRouter API key is invalid.');
        if (status === 402) throw new BadRequestException('OpenRouter account has insufficient credits.');
        this.logger.error(`OpenRouter API error (${status}): ${msg}`);
        throw new BadRequestException(`AI request failed: ${msg}`);
      }
      throw err;
    }
  }

  private async resolveKeyAndModel(
    tenantId: number,
    modelOverride?: string,
    allowPlatformFallback: boolean = false,
  ): Promise<{ apiKey: string; model: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'settings', 'openrouterApiKey'],
    });
    // Priority: dedicated encrypted column → legacy settings field → platform key.
    const apiKey =
      tenant?.openrouterApiKey ||
      tenant?.settings?.openRouterApiKey ||
      (allowPlatformFallback ? process.env.OPENROUTER_API_KEY : null);
    if (!apiKey) {
      throw new BadRequestException(
        'OpenRouter API key not configured. Go to Settings → AI to add your key.',
      );
    }
    return {
      apiKey,
      model: await this.usableModel(modelOverride || tenant?.settings?.openRouterModel || DEFAULT_MODEL),
    };
  }

  // Public wrapper used by background services (e.g. AI enrichment) that
  // should silently fall back to the platform key when a tenant hasn't
  // configured their own. Returns null if no key is available anywhere.
  async resolveBackgroundKey(tenantId: number, modelOverride?: string): Promise<{ apiKey: string; model: string } | null> {
    try {
      return await this.resolveKeyAndModel(tenantId, modelOverride, true);
    } catch {
      return null;
    }
  }

  // Tests with the saved model (or the one it would fall back to), and says
  // so when OpenRouter has retired the saved one.
  async testConnection(
    tenantId: number,
    requestedModel?: string,
  ): Promise<{ ok: boolean; model: string; requested?: string; retired?: boolean; error?: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    const requested = requestedModel || tenant?.settings?.openRouterModel || DEFAULT_MODEL;
    const model = await this.usableModel(requested);
    try {
      const response = await this.chatCompletion(tenantId, [{ role: 'user', content: 'Reply with exactly: OK' }], {
        maxTokens: 10,
        model,
      });
      return { ok: response.toLowerCase().includes('ok'), model, requested, retired: model !== requested };
    } catch (err) {
      return { ok: false, model, requested, retired: model !== requested, error: (err as Error).message };
    }
  }
}
