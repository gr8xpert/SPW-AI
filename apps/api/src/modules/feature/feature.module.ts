import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { ReorderModule } from '../reorder/reorder.module';
import { Feature } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Feature]), ReorderModule],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}
