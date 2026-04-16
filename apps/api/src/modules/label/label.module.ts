import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelController } from './label.controller';
import { PublicLabelController } from './public-label.controller';
import { LabelService } from './label.service';
import { Label } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Label]), TenantModule],
  controllers: [LabelController, PublicLabelController],
  providers: [LabelService],
  exports: [LabelService],
})
export class LabelModule {}
