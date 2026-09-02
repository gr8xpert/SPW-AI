import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientImportService } from './client-import.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload, UserRole } from '@spm/shared';

// Super-admin-only bulk client importer. Two endpoints so the UI can do a
// safe "preview → confirm" round trip: preview parses + validates and
// returns per-row status; execute actually writes to the DB.
//
// CSV is uploaded as multipart/form-data. Buffer size capped at 5 MB via
// the FileInterceptor limits — 2000-row cap in the service is the harder
// gate on runaway files.
@Controller('api/super-admin/clients/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ClientImportController {
  constructor(private readonly clientImportService: ClientImportService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async preview(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required (multipart field "file")');
    }
    const csv = file.buffer.toString('utf8');
    return this.clientImportService.preview(csv);
  }

  @Post('execute')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async execute(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required (multipart field "file")');
    }
    const csv = file.buffer.toString('utf8');
    return this.clientImportService.execute(csv, user.sub);
  }
}
