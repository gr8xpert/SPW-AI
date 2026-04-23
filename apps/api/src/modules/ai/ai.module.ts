import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { AiService } from './ai.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
