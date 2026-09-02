import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property, Tenant } from '../../database/entities';
import { AiModule } from '../ai/ai.module';
import { AiSeoService } from './ai-seo.service';
import { AiSeoController } from './ai-seo.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, Tenant]),
    AiModule,
  ],
  controllers: [AiSeoController],
  providers: [AiSeoService, DashboardAddonGuard],
  exports: [AiSeoService],
})
export class AiSeoModule {}
