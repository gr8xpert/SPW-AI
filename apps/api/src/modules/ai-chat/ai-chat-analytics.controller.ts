import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AiChatAnalyticsService } from './ai-chat-analytics.service';
import { AiChatService } from './ai-chat.service';
import { ChatAnalyticsQueryDto, ChatConversationListDto } from './dto/chat-analytics-query.dto';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('api/dashboard/ai-chat')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiChatAnalyticsController {
  constructor(
    private readonly analyticsService: AiChatAnalyticsService,
    private readonly chatService: AiChatService,
  ) {}

  @Get('stats')
  async getStats(
    @CurrentTenant('id') tenantId: number,
    @Query() dto: ChatAnalyticsQueryDto,
  ) {
    return this.analyticsService.getStats(tenantId, dto.range || '30d');
  }

  @Get('conversations')
  async listConversations(
    @CurrentTenant('id') tenantId: number,
    @Query() dto: ChatConversationListDto,
  ) {
    return this.analyticsService.listConversations(
      tenantId,
      dto.status,
      dto.page || 1,
      dto.limit || 20,
    );
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentTenant('id') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.chatService.getConversation(tenantId, id);
  }
}
