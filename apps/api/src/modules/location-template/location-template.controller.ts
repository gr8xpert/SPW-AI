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
import { UnmatchedReviewService } from './unmatched-review.service';
import { TemplateAutoFillService } from './template-autofill.service';
import {
  CreateTemplateNodeDto,
  FillMissingDto,
  MapUnmatchedDto,
  MergeTemplateNodeDto,
  MoveTemplateNodeDto,
  ReapplyTemplateDto,
  UpdateTemplateNodeDto,
} from './dto/location-template.dto';

// Super Admin → Location Template.
@Controller('api/super-admin/location-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class LocationTemplateController {
  constructor(
    private readonly service: LocationTemplateService,
    private readonly review: UnmatchedReviewService,
    private readonly autoFill: TemplateAutoFillService,
  ) {}

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

  // Names sorted recently, with what Undo would reverse.
  @Get('unmatched/sorted')
  sorted() {
    return this.service.listSortedUnmatched();
  }

  @Post('unmatched/:id/undo')
  @HttpCode(HttpStatus.OK)
  undo(@Param('id', ParseIntPipe) id: number) {
    return this.service.undoUnmatched(id);
  }

  // AI review: the next open names nobody has asked about (40 per call).
  @Post('unmatched/ai-review')
  @HttpCode(HttpStatus.OK)
  aiReview() {
    return this.review.reviewOpen();
  }

  // Accept every AI suggestion that isn't flagged as far from its listings.
  @Post('unmatched/accept-all')
  @HttpCode(HttpStatus.OK)
  acceptAll() {
    return this.review.acceptAll();
  }

  @Post('unmatched/:id/ai-review')
  @HttpCode(HttpStatus.OK)
  aiReviewOne(@Param('id', ParseIntPipe) id: number) {
    return this.review.reviewOne(id);
  }

  @Post('unmatched/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id', ParseIntPipe) id: number) {
    return this.review.accept(id);
  }

  // Places the template has twice in one province at the same level.
  @Get('duplicates')
  duplicates() {
    return this.review.duplicates();
  }

  // The feed's spelling is another name for an existing template place.
  @Post('unmatched/:id/map')
  @HttpCode(HttpStatus.OK)
  map(@Param('id', ParseIntPipe) id: number, @Body() dto: MapUnmatchedDto) {
    return this.service.mapUnmatched(id, dto.nodeId);
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

  // Clears impossible points (swapped, outside Spain, far from the rest of
  // their municipality) and counts the towns still without one.
  @Post('check-coords')
  @HttpCode(HttpStatus.OK)
  checkCoords() {
    return this.service.checkAllCoords();
  }

  // Fill missing points and postcodes: map geocoder first, then AI. Each call
  // works ~35 s and reports progress; the page calls again until none remain.
  @Get('fill-missing')
  fillStatus() {
    return this.autoFill.status();
  }

  @Post('fill-missing')
  @HttpCode(HttpStatus.OK)
  fillMissing(@Body() dto: FillMissingDto) {
    return this.autoFill.fillNext(dto.retry === true);
  }

  // Clears every auto-filled value nobody has changed since.
  @Post('fill-missing/undo')
  @HttpCode(HttpStatus.OK)
  undoFill() {
    return this.autoFill.undoAll();
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

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  merge(@Param('id', ParseIntPipe) id: number, @Body() dto: MergeTemplateNodeDto) {
    return this.service.merge(id, dto.targetId, dto.keep ?? 'target');
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
