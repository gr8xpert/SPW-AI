import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Tenant } from '../../database/entities';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
            'HTTP-Referer': 'https://spw.app',
            'X-Title': 'SPW Property Manager',
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
