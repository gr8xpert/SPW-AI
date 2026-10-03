import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Property, PropertyType, Feature, Label, Tenant } from '../../database/entities';
import { AiModule } from '../ai/ai.module';
import { TenantModule } from '../tenant/tenant.module';
import { TranslationService } from './translation.service';
import { TranslationProcessor } from './translation.processor';
import { TranslationController } from './translation.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType, Feature, Label, Tenant]),
    BullModule.registerQueue({
      name: 'translation',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    }),
    AiModule,
    // TenantService bumps syncVersion once a translation lands, so the widget
    // and WP plugin refetch. Same process as the BullMQ worker (main.ts).
    TenantModule,
  ],
  controllers: [TranslationController],
  providers: [TranslationService, TranslationProcessor, DashboardAddonGuard],
  exports: [TranslationService],
})
export class TranslationModule {}
