import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  ParseIntPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { TenantService } from '../tenant/tenant.service';
import { TrackViewDto, TrackSearchDto, TrackPdfDto } from './dto';
import { CurrentTenant, CurrentUser, Public } from '../../common/decorators';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Controller('api/dashboard/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getOverview(tenantId, dateRange);
  }

  @Get('activity')
  async getDailyActivity(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getDailyActivity(tenantId, dateRange);
  }

  @Get('events')
  async getEventBreakdown(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getEventBreakdown(tenantId, dateRange);
  }

  @Get('properties')
  async getTopProperties(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
    @Query('limit') limit: string = '10',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getTopProperties(
      tenantId,
      dateRange,
      parseInt(limit),
    );
  }

  @Get('searches')
  async getSearchAnalytics(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getSearchAnalytics(tenantId, dateRange);
  }

  @Get('funnel')
  async getFunnel(
    @CurrentTenant() tenantId: number,
    @Query('range') range: string = '30d',
  ) {
    const dateRange = this.parseDateRange(range);
    return this.analyticsService.getFunnel(tenantId, dateRange);
  }

  private parseDateRange(range: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (range) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 30);
    }

    return { start, end };
  }
}

// Widget tracking firehose. Per-tenant API-key bucket with a higher cap than
// the inquiry/share endpoints since a single page view can fire several
// track events legitimately (view + favorite-add + pdf-download).
@Controller('api/v1/track')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 300, ttl: 60_000 } })
export class TrackingController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly tenantService: TenantService,
  ) {}

  private async resolveTenant(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  @Public()
  @Post('view')
  async trackView(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: TrackViewDto,
    @Req() req: Request,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    await this.analyticsService.trackView(tenantId, dto, ip, userAgent);
    return { success: true };
  }

  @Public()
  @Post('search')
  async trackSearch(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: TrackSearchDto,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    await this.analyticsService.trackSearch(tenantId, dto);
    return { success: true };
  }

  @Public()
  @Post('pdf')
  async trackPdf(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: TrackPdfDto,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    await this.analyticsService.markPdfDownload(tenantId, dto.propertyId, dto.sessionId);
    return { success: true };
  }
}

@Controller('api/v1/favorites')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 120, ttl: 60_000 } })
export class FavoritesController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly tenantService: TenantService,
  ) {}

  private async resolveTenant(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  @Public()
  @Get()
  async getFavorites(
    @Headers('x-api-key') apiKey: string,
    @Query('sessionId') sessionId: string,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    return this.analyticsService.getFavorites(tenantId, sessionId);
  }

  @Public()
  @Post()
  async addFavorite(
    @Headers('x-api-key') apiKey: string,
    @Body('propertyId') propertyId: number,
    @Body('sessionId') sessionId: string,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    return this.analyticsService.addFavorite(tenantId, propertyId, sessionId);
  }

  @Public()
  @Delete(':propertyId')
  async removeFavorite(
    @Headers('x-api-key') apiKey: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Query('sessionId') sessionId: string,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    await this.analyticsService.removeFavorite(tenantId, propertyId, sessionId);
    return { success: true };
  }
}
