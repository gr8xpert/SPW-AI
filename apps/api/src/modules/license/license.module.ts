import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';
import { LicenseKey, Tenant, Plan } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([LicenseKey, Tenant, Plan])],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
