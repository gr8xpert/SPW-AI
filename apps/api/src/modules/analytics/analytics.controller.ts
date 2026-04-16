import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { TrackViewDto, TrackSearchDto } from './dto';
import { CurrentTenant, CurrentUser, Public } from '../../common/decorators';

// Dashboard Analytics Controller
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

// Public Tracking Controller (for widget)
@Controller('api/v1/track')
export class TrackingController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Post('view')
  async trackView(
    @CurrentTenant() tenantId: number,
    @Body() dto: TrackViewDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    await this.analyticsService.trackView(tenantId, dto, ip, userAgent);
    return { success: true };
  }

  @Public()
  @Post('search')
  async trackSearch(
    @CurrentTenant() tenantId: number,
    @Body() dto: TrackSearchDto,
  ) {
    await this.analyticsService.trackSearch(tenantId, dto);
    return { success: true };
  }
}

// Public Favorites Controller (for widget)
@Controller('api/v1/favorites')
export class FavoritesController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Get()
  async getFavorites(
    @CurrentTenant() tenantId: number,
    @Query('sessionId') sessionId: string,
  ) {
    return this.analyticsService.getFavorites(tenantId, sessionId);
  }

  @Public()
  @Post()
  async addFavorite(
    @CurrentTenant() tenantId: number,
    @Body('propertyId') propertyId: number,
    @Body('sessionId') sessionId: string,
  ) {
    return this.analyticsService.addFavorite(tenantId, propertyId, sessionId);
  }

  @Public()
  @Delete(':propertyId')
  async removeFavorite(
    @CurrentTenant() tenantId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Query('sessionId') sessionId: string,
  ) {
    await this.analyticsService.removeFavorite(tenantId, propertyId, sessionId);
    return { success: true };
  }
}
