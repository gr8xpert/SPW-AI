import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { TranslationMemoryAdminService } from './translation-memory-admin.service';
import { FillMemoryDto, ListMemoryQueryDto, RemoveMemoryDto, SaveMemoryDto } from './dto/translation-memory.dto';
import { MEMORY_LANGUAGES, TranslationMemoryFillService } from './translation-memory-fill.service';

// Super Admin → Translation Memory.
@Controller('api/super-admin/translation-memory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class TranslationMemoryController {
  constructor(
    private readonly service: TranslationMemoryAdminService,
    private readonly fill: TranslationMemoryFillService,
  ) {}

  // Progress of "Translate everything", plus the languages to offer.
  @Get('fill')
  async fillStatus() {
    return {
      status: await this.fill.getStatus(),
      clientLanguages: await this.fill.defaultLanguages(),
      allLanguages: MEMORY_LANGUAGES,
    };
  }

  @Post('fill')
  @HttpCode(HttpStatus.OK)
  startFill(@Body() dto: FillMemoryDto) {
    return this.fill.start(dto.languages);
  }

  @Get()
  list(@Query() query: ListMemoryQueryDto) {
    return this.service.list(query);
  }

  // Sent raw so the response wrapper doesn't turn the file into JSON.
  @Get('export')
  async export(@Res() res: Response) {
    const csv = await this.service.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="translation-memory.csv"');
    res.send('﻿' + csv);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a CSV file');
    return this.service.importCsv(file.buffer.toString('utf8'));
  }

  @Post('save')
  @HttpCode(HttpStatus.OK)
  save(@Body() dto: SaveMemoryDto) {
    return this.service.save(dto.kind, dto.english, dto.lang, dto.text);
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  remove(@Body() dto: RemoveMemoryDto) {
    return this.service.remove(dto.kind, dto.sourceKey, dto.lang);
  }

  @Post('apply-all')
  @HttpCode(HttpStatus.OK)
  applyAll() {
    return this.service.applyAll();
  }

  @Post('learn')
  @HttpCode(HttpStatus.OK)
  learn() {
    return this.service.seedFromClients();
  }
}
