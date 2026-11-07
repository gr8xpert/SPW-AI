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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ExportFeedsService } from './export-feeds.service';
import { MatchReferencesDto, UpdateExportFeedDto } from './dto';
import { CurrentTenant, Public, RequiresAddon } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';
import { MANUAL_RUN_THROTTLE } from './manual-run';

// Feed Export -> Feeds: the client's extra portal feeds.
@Controller('api/dashboard/feed-export/feeds')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('feedExport')
export class ExportFeedsController {
  constructor(private readonly service: ExportFeedsService) {}

  @Get()
  list(@CurrentTenant() tenantId: number) {
    return this.service.list(tenantId);
  }

  @Post()
  create(@CurrentTenant() tenantId: number, @Body() dto: UpdateExportFeedDto) {
    return this.service.create(tenantId, dto);
  }

  // Before :id routes, so "match-references" is never read as an id.
  @Post('match-references')
  @HttpCode(HttpStatus.OK)
  matchReferences(@CurrentTenant() tenantId: number, @Body() dto: MatchReferencesDto) {
    return this.service.matchReferences(tenantId, dto.references);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExportFeedDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(tenantId, id);
  }

  @Post(':id/regenerate-key')
  regenerateKey(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.service.regenerateKey(tenantId, id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Throttle(MANUAL_RUN_THROTTLE)
  run(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.service.runNow(tenantId, id, req.ip || '', String(req.headers['user-agent'] || ''));
  }

  @Get(':id/logs')
  logs(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('days') days?: string,
  ) {
    const d = Math.min(Math.max(parseInt(days || '') || 30, 1), 90);
    return this.service.getLogs(tenantId, id, d);
  }
}

// The public URL a portal reads: /api/feed/<client>/x/<feed key>/<any name>.xml
// The file name is only there so the URL looks like a file to the portal.
@Controller('api/feed')
export class ExportFeedsPublicController {
  constructor(private readonly service: ExportFeedsService) {}

  @Public()
  @Get(':tenantSlug/x/:feedKey/:file')
  async feed(
    @Param('tenantSlug') tenantSlug: string,
    @Param('feedKey') feedKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { content } = await this.service.publicFeed(
      tenantSlug,
      feedKey,
      req.ip || req.socket.remoteAddress || '',
      String(req.headers['user-agent'] || ''),
    );
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(content);
  }
}
