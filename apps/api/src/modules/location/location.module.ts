import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { ReorderModule } from '../reorder/reorder.module';
import { Location } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Location]), ReorderModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
