import {
  BadRequestException,
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { PropertyTypeTemplateService } from './property-type-template.service';
import { CreateTypeNodeDto, MoveTypeNodeDto, ReapplyTypesDto, UpdateTypeNodeDto } from './dto/property-type-template.dto';

// Super Admin → Property Type Template.
@Controller('api/super-admin/property-type-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PropertyTypeTemplateController {
  constructor(private readonly service: PropertyTypeTemplateService) {}

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

  // Sent raw so the response wrapper doesn't turn the file into JSON.
  @Get('export')
  async export(@Res() res: Response) {
    const csv = await this.service.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="property-type-template.csv"');
    res.send('﻿' + csv);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a CSV file');
    return this.service.importCsv(file.buffer.toString('utf8'));
  }

  @Post('reapply')
  @HttpCode(HttpStatus.OK)
  reapply(@Body() dto: ReapplyTypesDto) {
    return dto.tenantId ? this.service.reapplyTenant(dto.tenantId) : this.service.reapplyAll();
  }

  @Post()
  create(@Body() dto: CreateTypeNodeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTypeNodeDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/move')
  move(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveTypeNodeDto) {
    return this.service.move(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
