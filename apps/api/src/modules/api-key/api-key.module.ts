import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey, Property, Tenant } from '../../database/entities';
import { PropertyModule } from '../property/property.module';
import { LocationModule } from '../location/location.module';
import { PropertyTypeModule } from '../property-type/property-type.module';
import { FeatureModule } from '../feature/feature.module';
import { AiModule } from '../ai/ai.module';
import { ApiKeyController, SuperAdminApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, Tenant, Property]), PropertyModule, LocationModule, PropertyTypeModule, FeatureModule, AiModule],
  controllers: [ApiKeyController, SuperAdminApiKeyController],
  providers: [ApiKeyService],
})
export class ApiKeyModule {}
