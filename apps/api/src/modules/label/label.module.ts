import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelController } from './label.controller';
import { PublicLabelController } from './public-label.controller';
import { LabelService } from './label.service';
import { Label } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { TranslationMemoryModule } from '../translation-memory/translation-memory.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Label]), TenantModule, TranslationMemoryModule],
  controllers: [LabelController, PublicLabelController],
  providers: [LabelService, ApiKeyThrottlerGuard],
  exports: [LabelService],
})
export class LabelModule {}
