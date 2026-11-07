import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { FeedExportService, KEY_FEED_PREFIX } from './feed-export.service';
import { ExportFeedsService } from './export-feeds.service';
import { UpdateFeedExportConfigDto, UpdateJsonFeedDto } from './dto';
import { CurrentTenant, Public, RequiresAddon } from '../../common/decorators';
import { ExportFormat, ExportLogFormat } from '../../database/entities';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';
import { MANUAL_RUN_THROTTLE } from './manual-run';

// Dashboard controller for managing feed export config
@Controller('api/dashboard/feed-export')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('feedExport')
export class FeedExportConfigController {
  constructor(private readonly service: FeedExportService) {}

  @Get()
  getConfig(@CurrentTenant() tenantId: number) {
    return this.service.getConfig(tenantId);
  }

  @Put()
  updateConfig(
    @CurrentTenant() tenantId: number,
    @Body() dto: UpdateFeedExportConfigDto,
  ) {
    return this.service.createOrUpdateConfig(tenantId, dto);
  }

  @Post('regenerate-key')
  regenerateKey(@CurrentTenant() tenantId: number) {
    return this.service.regenerateKey(tenantId);
  }

  @Put('json')
  updateJsonFeed(
    @CurrentTenant() tenantId: number,
    @Body() dto: UpdateJsonFeedDto,
  ) {
    return this.service.updateJsonFeed(tenantId, dto);
  }

  @Post('json/regenerate-key')
  regenerateJsonKey(@CurrentTenant() tenantId: number) {
    return this.service.regenerateJsonKey(tenantId);
  }

  // Generates the feed now and logs it. Readers still fetch the URL themselves.
  @Post('json/run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Throttle(MANUAL_RUN_THROTTLE)
  runJson(@CurrentTenant() tenantId: number, @Req() req: Request) {
    return this.service.runNow(tenantId, 'json', req.ip || '', String(req.headers['user-agent'] || ''));
  }

  @Get('logs')
  getLogs(
    @CurrentTenant() tenantId: number,
    @Query('days') days?: string,
    @Query('format') format?: string,
    @Query('apiKeyId') apiKeyId?: string,
    @Query('exportFeedId') exportFeedId?: string,
  ) {
    const known: ExportLogFormat[] = ['xml', 'json', 'idealista'];
    const f = known.includes(format as ExportLogFormat) ? (format as ExportLogFormat) : undefined;
    const d = Math.min(Math.max(parseInt(days || '') || 7, 1), 90);
    const key = parseInt(apiKeyId || '') || undefined;
    const feed = parseInt(exportFeedId || '') || undefined;
    return this.service.getLogs(tenantId, d, f, key, feed);
  }
}

// Public feed export endpoint
@Controller('api/feed')
export class FeedExportController {
  constructor(
    private readonly service: FeedExportService,
    private readonly exportFeeds: ExportFeedsService,
  ) {}

  @Public()
  @Get(':tenantSlug/properties.xml')
  async exportXml(
    @Param('tenantSlug') tenantSlug: string,
    @Headers('x-api-key') headerKey: string,
    @Query('key') queryKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // A website key's own feed (Settings -> API Keys): only that key's listings.
    const providedKey = headerKey || queryKey || '';
    if (providedKey.startsWith(KEY_FEED_PREFIX)) {
      const { content, contentType } = await this.service.exportKeyFeed(
        tenantSlug,
        providedKey,
        req.ip || req.socket.remoteAddress || '',
        req.headers['user-agent'] || '',
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=900');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.send(content);
      return;
    }

    // The old Kyero XML tab's URL. That feed is a row in Feed Export -> Feeds
    // now, under the same key, so the URL portals already have keeps working.
    const { content } = await this.exportFeeds.publicFeed(
      tenantSlug,
      providedKey,
      req.ip || req.socket.remoteAddress || '',
      String(req.headers['user-agent'] || ''),
    );
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(content);
  }

  @Public()
  @Get(':tenantSlug/properties.json')
  async exportJson(
    @Param('tenantSlug') tenantSlug: string,
    @Headers('x-api-key') headerKey: string,
    @Query('key') queryKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { config, tenantId } = await this.service.validateExportKey(
      tenantSlug,
      // Portals like Kyero can only fetch a URL, so ?key= works too.
      headerKey || queryKey,
      'json',
    );

    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const { content, contentType } = await this.service.exportProperties(
      tenantId,
      config,
      'json' as ExportFormat,
      ip,
      userAgent,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Cache-Control',
      `private, max-age=${config.cacheTtl}`,
    );
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(content);
  }
}
