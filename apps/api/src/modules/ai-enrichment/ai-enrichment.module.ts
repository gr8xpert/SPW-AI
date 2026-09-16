import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location, PropertyType, Feature } from '../../database/entities';
import { AiEnrichmentService } from './ai-enrichment.service';
import { AiEnrichmentController } from './ai-enrichment.controller';
import { AiModule } from '../ai/ai.module';
import { LocationModule } from '../location/location.module';
import { PropertyTypeModule } from '../property-type/property-type.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, PropertyType, Feature]),
    AiModule,
    // For LocationService.bulkMove, used to fold duplicate area nodes together.
    // One-directional: LocationModule does not depend on AiEnrichmentModule,
    // so no forwardRef is needed.
    LocationModule,
    // Same for PropertyTypeService.merge, which folds duplicate type rows.
    PropertyTypeModule,
  ],
  controllers: [AiEnrichmentController],
  providers: [AiEnrichmentService],
  exports: [AiEnrichmentService],
})
export class AiEnrichmentModule {}
