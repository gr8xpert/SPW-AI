import {
  Controller,
  Get,
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
import { FeedExportService } from './feed-export.service';
import { UpdateFeedExportConfigDto, UpdateJsonFeedDto } from './dto';
import { CurrentTenant, Public, RequiresAddon } from '../../common/decorators';
import { ExportFormat, ExportLogFormat } from '../../database/entities';
import { JwtAuthGuard, TenantGuard, DashboardAddonGuard } from '../../common/guards';

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

  @Get('logs')
  getLogs(
    @CurrentTenant() tenantId: number,
    @Query('days') days?: string,
    @Query('format') format?: string,
  ) {
    const known: ExportLogFormat[] = ['xml', 'json', 'idealista'];
    const f = known.includes(format as ExportLogFormat) ? (format as ExportLogFormat) : undefined;
    return this.service.getLogs(tenantId, days ? parseInt(days) : 7, f);
  }
}

// Public feed export endpoint
@Controller('api/feed')
export class FeedExportController {
  constructor(private readonly service: FeedExportService) {}

  @Public()
  @Get(':tenantSlug/properties.xml')
  async exportXml(
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
    );

    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const { content, contentType } = await this.service.exportProperties(
      tenantId,
      config,
      'xml' as ExportFormat,
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
