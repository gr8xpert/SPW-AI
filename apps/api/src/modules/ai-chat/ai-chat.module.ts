import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatConversation, ChatMessage, Tenant } from '../../database/entities';
import { AiModule } from '../ai/ai.module';
import { TenantModule } from '../tenant/tenant.module';
import { PropertyModule } from '../property/property.module';
import { LocationModule } from '../location/location.module';
import { FeatureModule } from '../feature/feature.module';
import { PropertyTypeModule } from '../property-type/property-type.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { AiChatAnalyticsController } from './ai-chat-analytics.controller';
import { AiChatAnalyticsService } from './ai-chat-analytics.service';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessage, Tenant]),
    AiModule,
    TenantModule,
    PropertyModule,
    LocationModule,
    FeatureModule,
    PropertyTypeModule,
  ],
  controllers: [AiChatController, AiChatAnalyticsController],
  providers: [
    AiChatService,
    AiChatToolsService,
    AiChatPromptService,
    AiChatAnalyticsService,
    ApiKeyThrottlerGuard,
  ],
  exports: [AiChatService],
})
export class AiChatModule {}
