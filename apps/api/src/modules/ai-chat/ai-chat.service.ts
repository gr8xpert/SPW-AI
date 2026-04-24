import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation, ChatMessage as ChatMessageEntity, Tenant } from '../../database/entities';
import { AiService, ChatMessage, ToolCall } from '../ai/ai.service';
import { TenantService } from '../tenant/tenant.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { SystemMailerService } from '../mail/system-mailer.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { SSEEvent, ChatContext } from './interfaces/chat-tool.interface';
import { TenantSettings } from '@spw/shared';

const MAX_TOOL_ITERATIONS = 3;
const MAX_CONTEXT_MESSAGES = 20;

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @InjectRepository(ChatConversation)
    private conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessageEntity)
    private messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    private readonly aiService: AiService,
    private readonly tenantService: TenantService,
    private readonly toolsService: AiChatToolsService,
    private readonly promptService: AiChatPromptService,
    private readonly mailerService: SystemMailerService,
  ) {}

  async *processMessage(
    tenantId: number,
    sessionId: string,
    dto: CreateChatMessageDto,
  ): AsyncGenerator<SSEEvent> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const settings: TenantSettings = tenant.settings || {};

    if (!settings.aiChatEnabled) {
      yield { type: 'error', data: { message: 'AI Chat is not enabled' } };
      return;
    }

    const maxMessages = settings.aiChatMaxMessagesPerConversation || 50;

    let conversation: ChatConversation;
    if (dto.conversationId) {
      const existing = await this.conversationRepo.findOne({
        where: { id: dto.conversationId, tenantId },
      });
      if (!existing || existing.status === 'closed') {
        conversation = await this.createConversation(tenantId, sessionId, dto.context);
      } else if (existing.messageCount >= maxMessages) {
        yield { type: 'error', data: { message: 'Conversation limit reached. Please start a new chat.' } };
        return;
      } else {
        conversation = existing;
      }
    } else {
      conversation = await this.createConversation(tenantId, sessionId, dto.context);
    }

    yield { type: 'conversation', data: { conversationId: conversation.id } };

    await this.saveMessage(conversation.id, 'user', dto.message);

    const systemPrompt = await this.promptService.buildSystemPrompt(
      tenantId,
      settings,
      dto.context as ChatContext,
    );

    const history = await this.loadHistory(conversation.id, settings);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    const tools = this.toolsService.getTools(settings);
    let totalTokens = 0;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.aiService.chatCompletionWithTools(
        tenantId,
        messages,
        tools.length ? tools : undefined,
        { temperature: 0.4, maxTokens: 2048 },
      );

      totalTokens += response.usage.totalTokens;

      if (response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          yield {
            type: 'tool_call',
            data: {
              tool: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
            },
          };

          const toolResult = await this.toolsService.executeTool(tenantId, toolCall);

          yield {
            type: 'tool_result',
            data: {
              tool: toolResult.name,
              ...(toolResult.name === 'search_properties' || toolResult.name === 'compare_properties'
                ? { properties: toolResult.result.properties || toolResult.result, total: toolResult.result.total }
                : { result: toolResult.result }),
            },
          };

          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            tool_call_id: toolCall.id,
          });

          await this.saveMessage(
            conversation.id,
            'tool',
            JSON.stringify(toolResult.result),
            toolCall.function.name,
            toolCall.id,
          );
        }

        continue;
      }

      if (response.content) {
        yield { type: 'delta', data: { content: response.content } };

        await this.saveMessage(conversation.id, 'assistant', response.content, null, null, totalTokens);

        conversation.messageCount += 2;
        conversation.lastMessageAt = new Date();
        if (!conversation.language && dto.context?.language) {
          conversation.language = dto.context.language;
        }
        await this.conversationRepo.save(conversation);

        this.tryAdminEmail(tenantId, conversation, settings).catch((err) =>
          this.logger.warn(`Admin email failed: ${err.message}`),
        );

        yield { type: 'done', data: { tokenCount: totalTokens } };
        return;
      }

      yield { type: 'done', data: { tokenCount: totalTokens } };
      return;
    }

    yield {
      type: 'delta',
      data: { content: 'I apologize, but I was unable to complete your request. Please try rephrasing your question.' },
    };
    await this.saveMessage(
      conversation.id,
      'assistant',
      'I apologize, but I was unable to complete your request. Please try rephrasing your question.',
    );
    yield { type: 'done', data: { tokenCount: totalTokens } };
  }

  async getConversation(tenantId: number, conversationId: number) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    return {
      ...conversation,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolName: m.toolName,
          createdAt: m.createdAt,
        })),
    };
  }

  async emailTranscript(
    tenantId: number,
    conversationId: number,
    email: string,
  ): Promise<void> {
    const conv = await this.getConversation(tenantId, conversationId);
    const html = this.buildTranscriptHtml(conv);
    await this.mailerService.send({
      to: email,
      subject: `Chat Transcript — Conversation #${conversationId}`,
      html,
      text: conv.messages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => `${m.role === 'user' ? 'You' : 'Assistant'}: ${m.content}`)
        .join('\n\n'),
    });
  }

  private async tryAdminEmail(
    tenantId: number,
    conversation: ChatConversation,
    settings: TenantSettings,
  ): Promise<void> {
    if (settings.aiChatAutoEmailAdmin === false) return;
    if (conversation.adminEmailed) return;

    const userMessageCount = await this.messageRepo.count({
      where: { conversationId: conversation.id, role: 'user' as any },
    });

    if (userMessageCount < 3) return;

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'ownerEmail'],
    });
    const adminEmail = tenant?.ownerEmail;
    if (!adminEmail) return;

    const conv = await this.getConversation(tenantId, conversation.id);
    const html = this.buildTranscriptHtml(conv);

    await this.mailerService.send({
      to: adminEmail,
      subject: `AI Chat Activity — ${userMessageCount} messages from a visitor`,
      html,
      text: `A website visitor has had ${userMessageCount} messages in an AI chat conversation.`,
    });

    conversation.adminEmailed = true as any;
    await this.conversationRepo.save(conversation);
  }

  private buildTranscriptHtml(conv: any): string {
    const rows = conv.messages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => {
        const label = m.role === 'user' ? 'Visitor' : 'AI Assistant';
        const bg = m.role === 'user' ? '#f0f0f0' : '#e8f4fd';
        const time = new Date(m.createdAt).toLocaleString();
        return `<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:${bg}">
          <strong>${label}</strong> <span style="color:#999;font-size:12px">${time}</span>
          <p style="margin:6px 0 0;white-space:pre-wrap">${this.escapeHtml(m.content)}</p>
        </div>`;
      })
      .join('');

    return `<div style="max-width:600px;font-family:sans-serif">
      <h2>Chat Transcript</h2>
      <p>Conversation #${conv.id} — ${new Date(conv.createdAt).toLocaleDateString()}</p>
      ${rows}
    </div>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async createConversation(
    tenantId: number,
    sessionId: string,
    context?: CreateChatMessageDto['context'],
  ): Promise<ChatConversation> {
    const conversation = this.conversationRepo.create({
      tenantId,
      sessionId,
      propertyReference: context?.propertyReference || null,
      language: context?.language || null,
      metadata: context ? { favorites: context.favorites, recentlyViewed: context.recentlyViewed } : null,
    });
    return this.conversationRepo.save(conversation);
  }

  private async saveMessage(
    conversationId: number,
    role: 'system' | 'user' | 'assistant' | 'tool',
    content: string,
    toolName?: string | null,
    toolCallId?: string | null,
    tokenCount?: number | null,
  ): Promise<ChatMessageEntity> {
    const msg = this.messageRepo.create({
      conversationId,
      role,
      content,
      toolName: toolName || null,
      toolCallId: toolCallId || null,
      tokenCount: tokenCount || null,
    });
    return this.messageRepo.save(msg);
  }

  private async loadHistory(
    conversationId: number,
    settings: TenantSettings,
  ): Promise<ChatMessage[]> {
    if (settings.aiChatConversational === false) {
      const lastMsg = await this.messageRepo.findOne({
        where: { conversationId, role: 'user' as any },
        order: { createdAt: 'DESC' },
      });
      return lastMsg ? [{ role: 'user', content: lastMsg.content }] : [];
    }

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const filtered = messages.filter((m) => m.role !== 'system');
    const recent = filtered.slice(-MAX_CONTEXT_MESSAGES);

    return recent.map((m) => {
      const msg: ChatMessage = { role: m.role as any, content: m.content };
      if (m.toolCallId) msg.tool_call_id = m.toolCallId;
      return msg;
    });
  }
}
