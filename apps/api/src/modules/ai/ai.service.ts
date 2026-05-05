import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Tenant } from '../../database/entities';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';

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
  ) {}

  async chatCompletion(
    tenantId: number,
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'settings'],
    });

    const apiKey = tenant?.settings?.openRouterApiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'OpenRouter API key not configured. Go to Settings → AI to add your key.',
      );
    }

    const model = options?.model || tenant.settings.openRouterModel || DEFAULT_MODEL;

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
  ): Promise<{ apiKey: string; model: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'settings'],
    });
    const apiKey = tenant?.settings?.openRouterApiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'OpenRouter API key not configured. Go to Settings → AI to add your key.',
      );
    }
    return {
      apiKey,
      model: modelOverride || tenant.settings.openRouterModel || DEFAULT_MODEL,
    };
  }

  async testConnection(tenantId: number): Promise<{ ok: boolean; model: string; error?: string }> {
    try {
      const response = await this.chatCompletion(tenantId, [
        { role: 'user', content: 'Reply with exactly: OK' },
      ], { maxTokens: 10 });
      const tenant = await this.tenantRepository.findOne({
        where: { id: tenantId },
        select: ['id', 'settings'],
      });
      return {
        ok: response.toLowerCase().includes('ok'),
        model: tenant?.settings?.openRouterModel || DEFAULT_MODEL,
      };
    } catch (err) {
      return {
        ok: false,
        model: '',
        error: (err as Error).message,
      };
    }
  }
}
