import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Tenant } from '../../database/entities';
import { FALLBACK_DEFAULT_MODEL, FALLBACK_ENRICHMENT_MODEL, RECOMMENDED_MODELS, openRouterBase } from './ai-models';
import { OpenRouterCatalogService } from './openrouter-catalog.service';
import { AnthropicBudgetService } from './anthropic-budget.service';
import {
  AnthropicCallError,
  CLIENT_ANTHROPIC_MODELS,
  anthropicComplete,
  clientAnthropicModel,
  platformAnthropicModel,
} from './anthropic-client';
import { anthropicCompleteWithTools } from './anthropic-tools';

const chatUrl = () => `${openRouterBase()}/chat/completions`;

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

// Whose OpenRouter account pays, fixed per feature:
//  - client:       the key the client entered in Settings → AI. Property AI,
//                  SEO, property translations, website AI search and the
//                  chatbot — the costly ones. No key there means the feature
//                  is off, never the platform key.
//  - client-first: the client's key when they have one, else the platform
//                  key. Locations, property types, features and labels (incl.
//                  their translations and AI organize) — cheap, and needed for
//                  the site to work.
//  - platform:     our key from .env. Super-admin work (global location
//                  templates, translation memory). ANTHROPIC_API_KEY first
//                  (our monthly Anthropic credit, see AnthropicBudgetService),
//                  else OPENROUTER_API_KEY — also when an Anthropic call fails.
export type AiKeySource = 'client' | 'client-first' | 'platform';

// Which API a resolved key belongs to. Absent means OpenRouter.
export type AiProvider = 'openrouter' | 'anthropic';

interface ResolvedKey {
  apiKey: string;
  model: string;
  provider?: AiProvider;
  // Set on Anthropic keys: our credit (budget-tracked) or the client's own.
  owner?: 'platform' | 'client';
}

type TenantKeys = Pick<Tenant, 'id' | 'settings' | 'openrouterApiKey' | 'anthropicApiKey'>;

// The client's key for one call. settings.aiProvider picks OpenRouter (the
// default) or Anthropic; audio always needs OpenRouter (Claude can't hear),
// so a client on Anthropic uses their OpenRouter key for voice when they
// kept one.
function clientKeyOf(
  tenant: TenantKeys | null,
  needsAudio: boolean,
  // Settings → AI test: this provider's key, whichever one is saved as in use.
  provider?: AiProvider,
): { apiKey: string; provider: AiProvider } | null {
  if (!tenant) return null;
  if ((provider ?? tenant.settings?.aiProvider) === 'anthropic' && !needsAudio) {
    return tenant.anthropicApiKey ? { apiKey: tenant.anthropicApiKey, provider: 'anthropic' } : null;
  }
  return tenant.openrouterApiKey ? { apiKey: tenant.openrouterApiKey, provider: 'openrouter' } : null;
}

function hasAudio(messages: Array<ChatMessage | MultimodalMessage>): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'input_audio'));
}

const KEY_SELECT: Array<keyof Tenant> = ['id', 'settings', 'openrouterApiKey', 'anthropicApiKey'];

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
    @Optional() private readonly anthropicBudget?: AnthropicBudgetService,
  ) {}

  /** Whether .env has any platform key (Anthropic or OpenRouter). */
  hasPlatformKey(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY);
  }

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
      // Anthropic direct: which provider is in use and the Claude models.
      provider: tenant?.settings?.aiProvider === 'anthropic' ? 'anthropic' : 'openrouter',
      anthropicModels: CLIENT_ANTHROPIC_MODELS,
      anthropicSaved: clientAnthropicModel(undefined, tenant?.settings?.anthropicModel),
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
      // Ask for a JSON object reply (OpenRouter's response_format; on
      // Anthropic the prompt alone asks for it).
      json?: boolean;
      // Platform key: go straight to OpenRouter (set when Anthropic failed).
      skipAnthropic?: boolean;
      // Client key of this provider, whichever is saved (Settings → AI test).
      provider?: AiProvider;
    },
  ): Promise<string> {
    const source = options?.keySource ?? 'client';
    const resolved = await this.resolveKeyAndModel(tenantId, options?.model, source, {
      skipAnthropic: options?.skipAnthropic,
      needsAudio: hasAudio(messages),
      provider: options?.provider,
    });
    if (resolved.provider === 'anthropic') {
      return resolved.owner === 'client'
        ? this.clientAnthropicChat(tenantId, messages, resolved, source, options)
        : this.platformAnthropicChat(tenantId, messages, resolved, options);
    }
    const { apiKey, model } = resolved;
    // Say whose key failed: a rejected platform key used to read "check your
    // key in Settings → AI", sending a client without a key to the wrong place.
    const onPlatformKey = source === 'platform' || (source === 'client-first' && !(await this.hasClientKey(tenantId)));
    const whose = onPlatformKey
      ? 'The platform OpenRouter key (OPENROUTER_API_KEY in the API .env)'
      : 'Your OpenRouter API key (Settings → AI)';

    try {
      const response = await axios.post(
        chatUrl(),
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 4096,
          ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
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
        const finish = response.data?.choices?.[0]?.finish_reason;
        throw new Error(
          finish === 'length'
            ? 'Empty response from OpenRouter (the model used its whole token limit before answering)'
            : 'Empty response from OpenRouter',
        );
      }
      return content;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        this.logger.error(`OpenRouter API error (${status}, ${onPlatformKey ? 'platform' : 'client'} key, tenant=${tenantId}): ${msg}`);
        // Types, features and labels: a client key OpenRouter rejects or that
        // has run dry counts as no key, so the platform key takes over.
        if (source === 'client-first' && !onPlatformKey && (status === 401 || status === 402) && this.hasPlatformKey()) {
          this.logger.warn(`Client key of tenant=${tenantId} failed (${status}); retrying on the platform key`);
          return this.chatCompletion(tenantId, messages, { ...options, keySource: 'platform' });
        }
        if (status === 401) {
          throw new BadRequestException(`${whose} was rejected by OpenRouter (${msg}).`);
        }
        if (status === 402) {
          throw new BadRequestException(`${whose} has no OpenRouter credits left.`);
        }
        throw new BadRequestException(`AI request failed: ${msg}`);
      }
      throw err;
    }
  }

  // Platform work on our Anthropic credit. Any failure hands the same call to
  // the OpenRouter platform key when there is one; a bad key or an empty
  // credit also pauses Anthropic for a while so the next calls skip it.
  private async platformAnthropicChat(
    tenantId: number,
    messages: Array<ChatMessage | MultimodalMessage>,
    resolved: ResolvedKey,
    options?: Parameters<AiService['chatCompletion']>[2],
  ): Promise<string> {
    try {
      const { text, usage } = await anthropicComplete(resolved.apiKey, resolved.model, messages, options?.maxTokens ?? 4096);
      await this.anthropicBudget?.record(resolved.model, usage);
      return text;
    } catch (err) {
      const usage = (err as { usage?: { inputTokens: number; outputTokens: number } }).usage;
      if (usage) await this.anthropicBudget?.record(resolved.model, usage);
      const kind = err instanceof AnthropicCallError ? err.kind : 'other';
      if (kind === 'credits' || kind === 'auth') await this.anthropicBudget?.pause(kind);
      this.logger.error(`Anthropic platform call failed (${kind}, tenant=${tenantId}): ${(err as Error).message}`);
      if (process.env.OPENROUTER_API_KEY) {
        this.logger.warn(`Retrying tenant=${tenantId} on the OpenRouter platform key`);
        return this.chatCompletion(tenantId, messages, { ...options, keySource: 'platform', skipAnthropic: true });
      }
      throw new BadRequestException(
        kind === 'credits'
          ? 'The platform Anthropic key (ANTHROPIC_API_KEY) has no credit left, and no OpenRouter platform key is set.'
          : kind === 'auth'
            ? 'The platform Anthropic key (ANTHROPIC_API_KEY) was rejected, and no OpenRouter platform key is set.'
            : `AI request failed: ${(err as Error).message}`,
      );
    }
  }

  // The client's own Anthropic key. Their credit, so nothing is recorded
  // against our budget. Types/features/labels (client-first) move to the
  // platform key when theirs is rejected or empty, as on OpenRouter.
  private async clientAnthropicChat(
    tenantId: number,
    messages: Array<ChatMessage | MultimodalMessage>,
    resolved: ResolvedKey,
    source: AiKeySource,
    options?: Parameters<AiService['chatCompletion']>[2],
  ): Promise<string> {
    try {
      return (await anthropicComplete(resolved.apiKey, resolved.model, messages, options?.maxTokens ?? 4096)).text;
    } catch (err) {
      this.logger.error(`Anthropic API error (client key, tenant=${tenantId}): ${(err as Error).message}`);
      const kind = err instanceof AnthropicCallError ? err.kind : 'other';
      if (source === 'client-first' && (kind === 'credits' || kind === 'auth') && this.hasPlatformKey()) {
        this.logger.warn(`Client Anthropic key of tenant=${tenantId} failed (${kind}); retrying on the platform key`);
        return this.chatCompletion(tenantId, messages, { ...options, keySource: 'platform' });
      }
      throw this.clientAnthropicError(err);
    }
  }

  private clientAnthropicError(err: unknown): BadRequestException {
    const kind = err instanceof AnthropicCallError ? err.kind : 'other';
    if (kind === 'auth') return new BadRequestException('Your Anthropic API key (Settings → AI) was rejected by Anthropic.');
    if (kind === 'credits') return new BadRequestException('Your Anthropic API key (Settings → AI) has no credit left.');
    return new BadRequestException(`AI request failed: ${(err as Error).message}`);
  }

  async chatCompletionWithTools(
    tenantId: number,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    // The website chatbot: always the client's own key.
    const resolved = await this.resolveKeyAndModel(tenantId, options?.model, 'client');
    const { apiKey, model } = resolved;
    if (resolved.provider === 'anthropic') {
      try {
        return await anthropicCompleteWithTools(apiKey, model, messages, tools, options?.maxTokens ?? 4096);
      } catch (err) {
        this.logger.error(`Anthropic API error (chatbot, tenant=${tenantId}): ${(err as Error).message}`);
        throw this.clientAnthropicError(err);
      }
    }

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

      const response = await axios.post(chatUrl(), body, {
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

  /** Whether the client has a key for their chosen provider in Settings → AI. */
  async hasClientKey(tenantId: number): Promise<boolean> {
    const row = await this.tenantRepository.findOne({ where: { id: tenantId }, select: KEY_SELECT });
    return !!clientKeyOf(row, false);
  }

  /** Whether the client's keys can send audio (voice search, voice notes). */
  async hasClientAudioKey(tenantId: number): Promise<boolean> {
    const row = await this.tenantRepository.findOne({ where: { id: tenantId }, select: KEY_SELECT });
    return !!clientKeyOf(row, true);
  }

  private async resolveKeyAndModel(
    tenantId: number,
    modelOverride: string | undefined,
    source: AiKeySource,
    opts: { skipAnthropic?: boolean; needsAudio?: boolean; provider?: AiProvider } = {},
  ): Promise<ResolvedKey> {
    const { skipAnthropic = false, needsAudio = false } = opts;
    const platform = async (): Promise<ResolvedKey> => {
      // Our own work, so our model: the Anthropic one from .env, whatever
      // OpenRouter model the caller asked for.
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey && !skipAnthropic && (!this.anthropicBudget || (await this.anthropicBudget.available()))) {
        return { apiKey: anthropicKey, model: platformAnthropicModel(), provider: 'anthropic', owner: 'platform' };
      }
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new BadRequestException(
          source === 'client-first'
            ? 'No AI key: add your OpenRouter key in Settings → AI (the platform key OPENROUTER_API_KEY is not set on the server either).'
            : anthropicKey
              ? 'The platform Anthropic key is paused (monthly budget reached or credit used up) and OPENROUTER_API_KEY is not set.'
              : 'Platform AI key (ANTHROPIC_API_KEY or OPENROUTER_API_KEY) is not set.',
        );
      }
      // Our bill, our model: the client's model choice applies to their key only.
      return { apiKey, model: await this.usableModel(modelOverride || DEFAULT_MODEL) };
    };
    if (source === 'platform') return platform();

    const tenant = tenantId
      ? await this.tenantRepository.findOne({ where: { id: tenantId }, select: KEY_SELECT })
      : null;
    // Only the keys shown in Settings → AI. A legacy settings.openRouterApiKey
    // copy is hidden from the dashboard, so it is never spent.
    const key = clientKeyOf(tenant, needsAudio, opts.provider);
    if (!key && source === 'client-first') return platform();
    if (!key) {
      const onAnthropic = (opts.provider ?? tenant?.settings?.aiProvider) === 'anthropic';
      throw new BadRequestException(
        onAnthropic && needsAudio
          ? 'Voice needs an OpenRouter key: Claude cannot hear recordings. Add an OpenRouter key in Settings → AI.'
          : onAnthropic
            ? 'Anthropic API key not configured. Go to Settings → AI to add your key.'
            : 'OpenRouter API key not configured. Go to Settings → AI to add your key.',
      );
    }
    if (key.provider === 'anthropic') {
      return {
        apiKey: key.apiKey,
        model: clientAnthropicModel(modelOverride, tenant?.settings?.anthropicModel),
        provider: 'anthropic',
        owner: 'client',
      };
    }
    const apiKey = key.apiKey;
    return {
      apiKey,
      model: await this.usableModel(modelOverride || tenant?.settings?.openRouterModel || DEFAULT_MODEL),
    };
  }

  // The platform key (super-admin work). Returns null when .env has no key.
  async resolvePlatformKey(modelOverride?: string): Promise<ResolvedKey | null> {
    try {
      return await this.resolveKeyAndModel(0, modelOverride, 'platform');
    } catch {
      return null;
    }
  }

  // The client's key, else the platform key — for a client's locations,
  // property types and features. Null when neither is set.
  async resolveClientFirstKey(
    tenantId: number,
    modelOverride?: string,
  ): Promise<(ResolvedKey & { source: 'client' | 'platform' }) | null> {
    try {
      const own = await this.hasClientKey(tenantId);
      const resolved = await this.resolveKeyAndModel(tenantId, modelOverride, 'client-first');
      return { ...resolved, source: own ? 'client' : 'platform' };
    } catch {
      return null;
    }
  }

  // Tests with the saved model (or the one it would fall back to), and says
  // so when OpenRouter has retired the saved one. `provider` tests that
  // provider's saved key, even before switching to it is saved.
  async testConnection(
    tenantId: number,
    requestedModel?: string,
    provider?: AiProvider,
  ): Promise<{ ok: boolean; model: string; requested?: string; retired?: boolean; error?: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if ((provider ?? tenant?.settings?.aiProvider) === 'anthropic') {
      const model = clientAnthropicModel(requestedModel, tenant?.settings?.anthropicModel);
      try {
        const response = await this.chatCompletion(tenantId, [{ role: 'user', content: 'Reply with exactly: OK' }], {
          maxTokens: 64,
          model,
          provider: 'anthropic',
        });
        return { ok: response.toLowerCase().includes('ok'), model };
      } catch (err) {
        return { ok: false, model, error: (err as Error).message };
      }
    }
    const requested = requestedModel || tenant?.settings?.openRouterModel || DEFAULT_MODEL;
    const model = await this.usableModel(requested);
    try {
      const response = await this.chatCompletion(tenantId, [{ role: 'user', content: 'Reply with exactly: OK' }], {
        // Thinking models (Gemini 3.x Flash) spend tokens reasoning before
        // they answer; a tiny cap leaves the reply empty.
        maxTokens: 1024,
        model,
        provider: 'openrouter',
      });
      return { ok: response.toLowerCase().includes('ok'), model, requested, retired: model !== requested };
    } catch (err) {
      return { ok: false, model, requested, retired: model !== requested, error: (err as Error).message };
    }
  }
}
