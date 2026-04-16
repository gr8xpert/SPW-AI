import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReorderController } from './reorder.controller';
import { ReorderService } from './reorder.service';
import {
  Location,
  PropertyType,
  Feature,
  LocationGroup,
  PropertyTypeGroup,
  FeatureGroup,
} from '../../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Location,
      PropertyType,
      Feature,
      LocationGroup,
      PropertyTypeGroup,
      FeatureGroup,
    ]),
  ],
  controllers: [ReorderController],
  providers: [ReorderService],
  exports: [ReorderService],
})
export class ReorderModule {}
