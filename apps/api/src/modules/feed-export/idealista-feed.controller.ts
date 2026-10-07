import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentTenant, Public, RequiresAddon } from '../../common/decorators';
import { DashboardAddonGuard, JwtAuthGuard, TenantGuard } from '../../common/guards';
import { UpdateIdealistaSettingsDto, UpdateIdealistaTypesDto } from './dto';
import { IdealistaFeedService } from './idealista-feed.service';

// Dashboard: the client's idealista card on the Feed Export page.
@Controller('api/dashboard/feed-export/idealista')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('feedExport')
export class IdealistaConfigController {
  constructor(private readonly service: IdealistaFeedService) {}

  @Get()
  overview(@CurrentTenant() tenantId: number) {
    return this.service.getOverview(tenantId);
  }

  @Put()
  updateSettings(@CurrentTenant() tenantId: number, @Body() dto: UpdateIdealistaSettingsDto) {
    return this.service.updateSettings(tenantId, dto);
  }

  @Post('regenerate-key')
  regenerateKey(@CurrentTenant() tenantId: number) {
    return this.service.regenerateKey(tenantId);
  }

  @Put('types')
  updateTypes(@CurrentTenant() tenantId: number, @Body() dto: UpdateIdealistaTypesDto) {
    return this.service.updateTypes(tenantId, dto);
  }

  @Get('check')
  check(@CurrentTenant() tenantId: number) {
    return this.service.check(tenantId);
  }

  // ?search=CH201 for the picker, or ?ids=1,2,3 for the picked listings.
  @Get('listings')
  listings(
    @CurrentTenant() tenantId: number,
    @Query('search') search?: string,
    @Query('ids') ids?: string,
  ) {
    const onlyIds =
      ids !== undefined
        ? ids.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500)
        : undefined;
    return this.service.searchListings(tenantId, (search || '').slice(0, 100), onlyIds);
  }
}

// Public: idealista downloads this URL. Its own key (idealista.feedKey) is in
// the path because idealista can't send headers.
@Controller('api/feed')
export class IdealistaFeedController {
  constructor(private readonly service: IdealistaFeedService) {}

  @Public()
  @Get(':tenantSlug/:feedKey/idealista.json')
  async feed(
    @Param('tenantSlug') tenantSlug: string,
    @Param('feedKey') feedKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const feed = await this.service.publicFeed(
      tenantSlug,
      feedKey,
      req.ip || req.socket.remoteAddress || '',
      String(req.headers['user-agent'] || ''),
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(JSON.stringify(feed));
  }
}
