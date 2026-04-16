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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FeedExportService } from './feed-export.service';
import { UpdateFeedExportConfigDto } from './dto';
import { CurrentTenant, Public } from '../../common/decorators';
import { ExportFormat } from '../../database/entities';

// Dashboard controller for managing feed export config
@Controller('api/dashboard/feed-export')
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

  @Get('logs')
  getLogs(
    @CurrentTenant() tenantId: number,
    @Query('days') days?: string,
  ) {
    return this.service.getLogs(tenantId, days ? parseInt(days) : 7);
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
    @Headers('x-api-key') apiKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { config, tenantId } = await this.service.validateExportKey(
      tenantSlug,
      apiKey,
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
      `public, max-age=${config.cacheTtl}`,
    );
    res.send(content);
  }

  @Public()
  @Get(':tenantSlug/properties.json')
  async exportJson(
    @Param('tenantSlug') tenantSlug: string,
    @Headers('x-api-key') apiKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { config, tenantId } = await this.service.validateExportKey(
      tenantSlug,
      apiKey,
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
      `public, max-age=${config.cacheTtl}`,
    );
    res.send(content);
  }
}
