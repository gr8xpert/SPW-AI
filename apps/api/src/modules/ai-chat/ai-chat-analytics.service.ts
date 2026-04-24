import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ChatConversation, ChatMessage } from '../../database/entities';

@Injectable()
export class AiChatAnalyticsService {
  constructor(
    @InjectRepository(ChatConversation)
    private conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private messageRepo: Repository<ChatMessage>,
  ) {}

  async getStats(tenantId: number, range: string) {
    const since = this.rangeToDays(range);

    const [totalConversations, totalMessages, toolUsage, languageBreakdown, dailyVolume] =
      await Promise.all([
        this.conversationRepo.count({
          where: { tenantId, createdAt: MoreThanOrEqual(since) },
        }),
        this.messageRepo
          .createQueryBuilder('m')
          .innerJoin('m.conversation', 'c')
          .where('c.tenantId = :tenantId', { tenantId })
          .andWhere('m.createdAt >= :since', { since })
          .andWhere('m.role IN (:...roles)', { roles: ['user', 'assistant'] })
          .getCount(),
        this.messageRepo
          .createQueryBuilder('m')
          .select('m.toolName', 'tool')
          .addSelect('COUNT(*)', 'count')
          .innerJoin('m.conversation', 'c')
          .where('c.tenantId = :tenantId', { tenantId })
          .andWhere('m.createdAt >= :since', { since })
          .andWhere('m.role = :role', { role: 'tool' })
          .andWhere('m.toolName IS NOT NULL')
          .groupBy('m.toolName')
          .orderBy('count', 'DESC')
          .getRawMany(),
        this.conversationRepo
          .createQueryBuilder('c')
          .select('c.language', 'language')
          .addSelect('COUNT(*)', 'count')
          .where('c.tenantId = :tenantId', { tenantId })
          .andWhere('c.createdAt >= :since', { since })
          .andWhere('c.language IS NOT NULL')
          .groupBy('c.language')
          .orderBy('count', 'DESC')
          .getRawMany(),
        this.conversationRepo
          .createQueryBuilder('c')
          .select('DATE(c.createdAt)', 'date')
          .addSelect('COUNT(*)', 'count')
          .where('c.tenantId = :tenantId', { tenantId })
          .andWhere('c.createdAt >= :since', { since })
          .groupBy('DATE(c.createdAt)')
          .orderBy('date', 'ASC')
          .getRawMany(),
      ]);

    const avgMessages =
      totalConversations > 0
        ? Math.round((totalMessages / totalConversations) * 10) / 10
        : 0;

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation: avgMessages,
      toolUsage,
      languageBreakdown,
      dailyVolume,
    };
  }

  async listConversations(
    tenantId: number,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    const where: any = { tenantId };
    if (status) where.status = status;

    const [data, total] = await this.conversationRepo.findAndCount({
      where,
      order: { lastMessageAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const conversationsWithPreview = await Promise.all(
      data.map(async (conv) => {
        const lastMsg = await this.messageRepo.findOne({
          where: { conversationId: conv.id, role: 'user' as any },
          order: { createdAt: 'DESC' },
        });
        return {
          ...conv,
          lastUserMessage: lastMsg?.content?.slice(0, 100) || null,
        };
      }),
    );

    return {
      data: conversationsWithPreview,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  private rangeToDays(range: string): Date {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    return since;
  }
}
