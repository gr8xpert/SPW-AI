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

// Whose OpenRouter account pays. Fixed per feature, never a fallback chain:
//  - client:   the key the client entered in Settings → AI. Property AI, SEO,
//              property translations, website AI search and the chatbot.
//              No key there means the feature is off — never the platform key.
//  - platform: OPENROUTER_API_KEY from .env. Locations, property types,
//              features, labels (incl. their translations) and everything in
//              the super-admin dashboard.
export type AiKeySource = 'client' | 'platform';

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

// A user turn carrying more than text, e.g. a recorded voice search. Only
// models whose input modalities include the part's kind can read it.
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' } };

export interface MultimodalMessage {
  role: 'user';
  content: ChatContentPart[];
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

  // For features that need a particular kind of model (audio input): the
  // first candidate OpenRouter still offers, or null when none is.
  async firstAvailableModel(candidates: string[]): Promise<string | null> {
    for (const id of candidates) {
      if (await this.catalog.isAvailable(id)) return id;
    }
    return null;
  }

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
    messages: Array<ChatMessage | MultimodalMessage>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      // Defaults to the client's own key; see AiKeySource.
      keySource?: AiKeySource;
    },
  ): Promise<string> {
    const { apiKey, model: resolvedModel } = await this.resolveKeyAndModel(
      tenantId,
      options?.model,
      options?.keySource ?? 'client',
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
    // The website chatbot: always the client's own key.
    const { apiKey, model } = await this.resolveKeyAndModel(tenantId, options?.model, 'client');

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

  /** Whether the client has entered their own key in Settings → AI. */
  async hasClientKey(tenantId: number): Promise<boolean> {
    const row = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'openrouterApiKey'] });
    return !!row?.openrouterApiKey;
  }

  private async resolveKeyAndModel(
    tenantId: number,
    modelOverride: string | undefined,
    source: AiKeySource,
  ): Promise<{ apiKey: string; model: string }> {
    if (source === 'platform') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new BadRequestException('Platform AI key (OPENROUTER_API_KEY) is not set.');
      // Our bill, our model: the client's model choice applies to their key only.
      return { apiKey, model: await this.usableModel(modelOverride || DEFAULT_MODEL) };
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'settings', 'openrouterApiKey'],
    });
    // Only the key shown in Settings → AI. A legacy settings.openRouterApiKey
    // copy is hidden from the dashboard, so it is never spent.
    const apiKey = tenant?.openrouterApiKey;
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

  // The platform key for classification work (locations, property types,
  // features, templates). Returns null when .env has no key.
  async resolvePlatformKey(modelOverride?: string): Promise<{ apiKey: string; model: string } | null> {
    try {
      return await this.resolveKeyAndModel(0, modelOverride, 'platform');
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
