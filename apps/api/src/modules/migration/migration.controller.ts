import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MigrationService } from './migration.service';
import { StartMigrationDto } from './dto';
import { CurrentTenant, CurrentUser } from '../../common/decorators';

const uploadDir = './uploads/migrations';

@Controller('api/dashboard/migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Post('validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedExt = ['.json', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExt.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JSON and CSV files are allowed'), false);
        }
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async validateFile(
    @CurrentTenant() tenantId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const result = await this.migrationService.validateFile(tenantId, file.path);

    return {
      ...result,
      fileId: path.basename(file.path),
    };
  }

  @Post('start')
  async startMigration(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() body: StartMigrationDto & { fileId: string },
  ) {
    if (!body.fileId) {
      throw new BadRequestException('fileId is required');
    }

    const filePath = path.join(uploadDir, body.fileId);

    return this.migrationService.startMigration(
      tenantId,
      userId,
      filePath,
      body,
    );
  }

  @Get('jobs')
  getJobs(@CurrentTenant() tenantId: number) {
    return this.migrationService.getJobs(tenantId);
  }

  @Get('jobs/:id')
  getJob(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.migrationService.getJob(tenantId, id);
  }

  @Delete('jobs/:id')
  cancelJob(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.migrationService.cancelJob(tenantId, id);
  }
}
