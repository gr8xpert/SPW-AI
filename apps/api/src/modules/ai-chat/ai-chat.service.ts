import { Injectable, Logger, NotFoundException, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { randomUUID, timingSafeEqual } from 'crypto';
import { ChatConversation, ChatMessage as ChatMessageEntity, Tenant } from '../../database/entities';
import { AiService, ChatMessage, ToolCall } from '../ai/ai.service';
import { TenantService } from '../tenant/tenant.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { SystemMailerService } from '../mail/system-mailer.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { SSEEvent, ChatContext } from './interfaces/chat-tool.interface';
import { TenantSettings } from '@spm/shared';

const MAX_TOOL_ITERATIONS = 3;
const MAX_CONTEXT_MESSAGES = 20;
const DEFAULT_TTL_DAYS = 7;
const FALLBACK_REPLY = 'I apologize, but I was unable to complete your request. Please try rephrasing your question.';

// The conversation's secret: only the visitor who started a chat can read
// it, continue it or email it (conversation ids are guessable).
function sameToken(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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
    dto: CreateChatMessageDto,
  ): AsyncGenerator<SSEEvent> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const settings: TenantSettings = tenant.settings || {};

    if (!tenant.featureFlags?.aiChatbot || !settings.aiChatEnabled) {
      yield { type: 'error', data: { message: 'AI Chat is not enabled' } };
      return;
    }

    const maxMessages = settings.aiChatMaxMessagesPerConversation || 50;

    // A chat continues only with its token; anything else starts a new one.
    let conversation: ChatConversation | null = null;
    if (dto.conversationId && dto.conversationToken) {
      const existing = await this.conversationRepo.findOne({
        where: { id: dto.conversationId, tenantId },
      });
      if (existing && existing.status !== 'closed' && sameToken(existing.sessionId, dto.conversationToken)) {
        if (existing.messageCount >= maxMessages) {
          yield { type: 'error', data: { code: 'LIMIT', message: 'Conversation limit reached. Please start a new chat.' } };
          return;
        }
        conversation = existing;
      }
    }
    if (!conversation) {
      conversation = await this.createConversation(tenantId, dto.context);
    }

    yield { type: 'conversation', data: { conversationId: conversation.id, token: conversation.sessionId } };

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
      const last = iteration === MAX_TOOL_ITERATIONS - 1;
      let response: Awaited<ReturnType<AiService['chatCompletionWithTools']>>;
      try {
        response = await this.aiService.chatCompletionWithTools(
          tenantId,
          messages,
          // The tools go on every round: Anthropic refuses a history holding
          // tool calls/results when the request has no tools.
          tools.length ? tools : undefined,
          { temperature: 0.4, maxTokens: 2048 },
        );
      } catch (err) {
        // The visitor sees a plain message; the reason (no key, credits,
        // provider down) goes to the log for the agency.
        const reason = err instanceof HttpException ? JSON.stringify(err.getResponse()) : (err as Error).message;
        this.logger.warn(`AI chat failed (tenant=${tenantId}, conversation=${conversation.id}): ${reason}`);
        yield { type: 'error', data: { code: 'AI_UNAVAILABLE', message: 'The assistant is not available right now. Please try again later.' } };
        return;
      }

      totalTokens += response.usage.totalTokens;

      // Tool calls on the last round are not run: the reply is what it has.
      if (response.toolCalls.length > 0 && !last) {
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
              args: parseArgs(toolCall.function.arguments),
            },
          };

          const toolResult = await this.toolsService.executeTool(tenantId, toolCall, settings);

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

      // Still asking for tools with no text: end with the fallback below.
      if (response.toolCalls.length > 0 && !response.content) break;

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

    yield { type: 'delta', data: { content: FALLBACK_REPLY } };
    await this.saveMessage(conversation.id, 'assistant', FALLBACK_REPLY);
    conversation.messageCount += 2;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);
    yield { type: 'done', data: { tokenCount: totalTokens } };
  }

  // The visitor's own conversation (the token proves it is theirs).
  async getVisitorConversation(tenantId: number, conversationId: number, token: string | undefined) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId, tenantId } });
    if (!conversation || !sameToken(conversation.sessionId, token)) throw new NotFoundException('Conversation not found');
    const conv = await this.getConversation(tenantId, conversationId);
    // Visitors get the chat itself, not the tool results or our bookkeeping.
    return {
      id: conv.id,
      status: conv.status,
      createdAt: conv.createdAt,
      messages: conv.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    };
  }

  async emailVisitorTranscript(tenantId: number, conversationId: number, token: string | undefined, email: string): Promise<void> {
    await this.getVisitorConversation(tenantId, conversationId, token);
    await this.emailTranscript(tenantId, conversationId, email);
  }

  // Closes chats nobody wrote in for the tenant's expiry days (Settings ->
  // AI Chat); a returning visitor then starts a new one.
  async closeExpired(now: Date = new Date()): Promise<number> {
    const rows: { tenantId: number }[] = await this.conversationRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.tenantId', 'tenantId')
      .where('c.status = :active', { active: 'active' })
      .getRawMany();
    let closed = 0;
    for (const { tenantId } of rows) {
      const tenant = await this.tenantRepo.findOne({ where: { id: Number(tenantId) }, select: ['id', 'settings'] });
      const days = Number((tenant?.settings as TenantSettings | null)?.aiChatConversationTTLDays) || DEFAULT_TTL_DAYS;
      const cutoff = new Date(now.getTime() - Math.min(Math.max(days, 1), 365) * 86_400_000);
      const res = await this.conversationRepo.update(
        { tenantId: Number(tenantId), status: 'active', lastMessageAt: LessThan(cutoff) },
        { status: 'closed' },
      );
      const never = await this.conversationRepo.update(
        { tenantId: Number(tenantId), status: 'active', lastMessageAt: IsNull(), createdAt: LessThan(cutoff) },
        { status: 'closed' },
      );
      closed += (res.affected ?? 0) + (never.affected ?? 0);
    }
    return closed;
  }

  async getConversation(tenantId: number, conversationId: number) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { id: 'ASC' },
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
    context?: CreateChatMessageDto['context'],
  ): Promise<ChatConversation> {
    const conversation = this.conversationRepo.create({
      tenantId,
      sessionId: randomUUID(),
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
        order: { id: 'DESC' },
      });
      return lastMsg ? [{ role: 'user', content: lastMsg.content }] : [];
    }

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { id: 'ASC' },
    });

    // Only the visible chat is replayed: stored tool results have no
    // matching assistant tool call, and both providers reject those.
    const visible = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const recent = visible.slice(-MAX_CONTEXT_MESSAGES);
    while (recent.length && recent[0].role !== 'user') recent.shift();

    return recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }
}
