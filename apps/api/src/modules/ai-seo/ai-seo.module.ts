import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Property, Tenant } from '../../database/entities';
import { AiModule } from '../ai/ai.module';
import { AiSeoService } from './ai-seo.service';
import { AiSeoProcessor } from './ai-seo.processor';
import { AiSeoController } from './ai-seo.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, Tenant]),
    BullModule.registerQueue({
      name: 'ai-seo',
      defaultJobOptions: {
        // No retries: a bulk run costs real OpenRouter credit, and a replay
        // would re-pay for every property the first attempt already finished.
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
    AiModule,
  ],
  controllers: [AiSeoController],
  providers: [AiSeoService, AiSeoProcessor, DashboardAddonGuard],
  exports: [AiSeoService],
})
export class AiSeoModule {}
