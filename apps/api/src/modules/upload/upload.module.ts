import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaFile, MediaBlob, TenantStorageConfig } from '../../database/entities';
import { UploadService } from './upload.service';
import { StorageConfigController, UploadController } from './upload.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaFile, MediaBlob, TenantStorageConfig])],
  controllers: [StorageConfigController, UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
