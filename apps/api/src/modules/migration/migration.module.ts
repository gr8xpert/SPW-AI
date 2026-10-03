import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  MigrationJob,
  Property,
  Location,
  PropertyType,
  Feature,
  Label,
} from '../../database/entities';
import { MigrationService } from './migration.service';
import { MigrationProcessor } from './migration.processor';
import { MigrationController } from './migration.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MigrationJob,
      Property,
      Location,
      PropertyType,
      Feature,
      Label,
    ]),
    BullModule.registerQueue({
      name: 'migration',
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
    // For the syncVersion bump when an import finishes.
    TenantModule,
  ],
  controllers: [MigrationController],
  providers: [MigrationService, MigrationProcessor],
  exports: [MigrationService],
})
export class MigrationModule {}
