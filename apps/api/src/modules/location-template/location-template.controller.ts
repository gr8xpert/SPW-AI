import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { LocationTemplateService } from './location-template.service';
import {
  CreateTemplateNodeDto,
  MoveTemplateNodeDto,
  ReapplyTemplateDto,
  UpdateTemplateNodeDto,
} from './dto/location-template.dto';

// Super Admin → Location Template.
@Controller('api/super-admin/location-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class LocationTemplateController {
  constructor(private readonly service: LocationTemplateService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('unmatched')
  unmatched() {
    return this.service.listUnmatched();
  }

  @Post('unmatched/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismiss(@Param('id', ParseIntPipe) id: number) {
    await this.service.dismissUnmatched(id);
    return { success: true };
  }

  // Sent raw (like the contacts export) so the response wrapper doesn't turn
  // the file into JSON. Leading BOM so Excel reads the accents correctly.
  @Get('export')
  async export(@Res() res: Response) {
    const csv = await this.service.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="location-template.csv"');
    res.send('﻿' + csv);
  }

  // Multipart upload: a template CSV is far over the 100 KB JSON body limit.
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a CSV file');
    return this.service.importCsv(file.buffer.toString('utf8'));
  }

  @Post('reapply')
  @HttpCode(HttpStatus.OK)
  reapply(@Body() dto: ReapplyTemplateDto) {
    return dto.tenantId ? this.service.reapplyTenant(dto.tenantId) : this.service.reapplyAll();
  }

  @Post()
  create(@Body() dto: CreateTemplateNodeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateNodeDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/move')
  move(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveTemplateNodeDto) {
    return this.service.move(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
