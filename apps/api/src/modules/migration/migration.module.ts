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
    }),
  ],
  controllers: [MigrationController],
  providers: [MigrationService, MigrationProcessor],
  exports: [MigrationService],
})
export class MigrationModule {}
