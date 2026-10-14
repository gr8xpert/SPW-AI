import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PropertyTypeTemplateNode, Tenant, TranslationMemory } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { AiModule } from '../ai/ai.module';
import { FILL_QUEUE, TranslationMemoryFillService } from './translation-memory-fill.service';
import { TranslationMemoryFillProcessor } from './translation-memory-fill.processor';
import { TranslationMemoryService } from './translation-memory.service';
import { TranslationMemoryAdminService } from './translation-memory-admin.service';
import { TranslationMemoryController } from './translation-memory.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TranslationMemory, Tenant, PropertyTypeTemplateNode]),
    BullModule.registerQueue({ name: FILL_QUEUE }),
    // Pushing a correction bumps each affected client's syncVersion.
    TenantModule,
    // "Translate everything" runs on the platform key.
    AiModule,
  ],
  controllers: [TranslationMemoryController],
  providers: [TranslationMemoryService, TranslationMemoryAdminService, TranslationMemoryFillService, TranslationMemoryFillProcessor],
  exports: [TranslationMemoryService],
})
export class TranslationMemoryModule {}
