import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsInt } from 'class-validator';
import { UploadService, UploadedFile as IUploadedFile } from './upload.service';
import { CreateStorageConfigDto, UpdateStorageConfigDto } from './dto';
import { CurrentTenant, Roles } from '../../common/decorators';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { UserRole } from '@spw/shared';

class UpdateFileOrderDto {
  @IsArray()
  @IsInt({ each: true })
  fileIds: number[];
}

class AssignFileDto {
  @IsInt()
  propertyId: number;
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('api/dashboard/storage-config')
export class StorageConfigController {
  constructor(private readonly uploadService: UploadService) {}

  @Get()
  getConfig(@CurrentTenant() tenantId: number) {
    return this.uploadService.getStorageConfig(tenantId);
  }

  @Roles(UserRole.ADMIN)
  @Put()
  updateConfig(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateStorageConfigDto | UpdateStorageConfigDto,
  ) {
    return this.uploadService.createOrUpdateStorageConfig(tenantId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('test')
  testConnection(@CurrentTenant() tenantId: number) {
    return this.uploadService.testS3Connection(tenantId);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/dashboard/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB hard cap; per-tenant cap applied later
    }),
  )
  async uploadFile(
    @CurrentTenant() tenantId: number,
    @UploadedFile() file: Express.Multer.File,
    @Query('propertyId') propertyId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const uploadedFile: IUploadedFile = {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    };

    const parsedPropertyId = propertyId ? Number.parseInt(propertyId, 10) : undefined;
    if (propertyId && Number.isNaN(parsedPropertyId)) {
      throw new BadRequestException('propertyId must be an integer');
    }

    return this.uploadService.uploadFile(tenantId, uploadedFile, parsedPropertyId);
  }

  @Delete(':id')
  async deleteFile(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.uploadService.deleteFile(tenantId, id);
    return { success: true };
  }

  @Get('property/:propertyId')
  getPropertyFiles(
    @CurrentTenant() tenantId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.uploadService.getFilesForProperty(tenantId, propertyId);
  }

  @Put('property/:propertyId/order')
  updateFileOrder(
    @CurrentTenant() tenantId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: UpdateFileOrderDto,
  ) {
    return this.uploadService.updateFileOrder(tenantId, propertyId, dto.fileIds);
  }

  @Put(':id/assign')
  assignToProperty(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignFileDto,
  ) {
    return this.uploadService.assignToProperty(tenantId, id, dto.propertyId);
  }
}
