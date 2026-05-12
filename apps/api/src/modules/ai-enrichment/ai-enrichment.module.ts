import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location, PropertyType, Feature } from '../../database/entities';
import { AiEnrichmentService } from './ai-enrichment.service';
import { AiEnrichmentController } from './ai-enrichment.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, PropertyType, Feature]),
    AiModule,
  ],
  controllers: [AiEnrichmentController],
  providers: [AiEnrichmentService],
  exports: [AiEnrichmentService],
})
export class AiEnrichmentModule {}
