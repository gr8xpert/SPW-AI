import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, Public, RequiresAddon, Roles } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendlyService } from './calendly.service';

class ConnectCalendlyDto {
  @IsString() @MinLength(10) @MaxLength(2000)
  token: string;
}

const sendIcs = (res: Response, ics: string, filename: string) => {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(ics);
};

// Calendly settings (managers). Registered before BuyerController so
// 'calendly' is not read as a buyer id.
@Controller('api/dashboard/buyers/calendly')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
@Roles('admin')
export class CalendlyController {
  constructor(private readonly calendly: CalendlyService) {}

  @Get()
  get(@CurrentTenant() tenantId: number) {
    return this.calendly.get(tenantId);
  }

  @Post('connect')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  connect(@CurrentTenant() tenantId: number, @Body() dto: ConnectCalendlyDto) {
    return this.calendly.connect(tenantId, dto.token);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@CurrentTenant() tenantId: number) {
    return this.calendly.refresh(tenantId);
  }

  @Delete()
  async disconnect(@CurrentTenant() tenantId: number) {
    await this.calendly.disconnect(tenantId);
    return this.calendly.get(tenantId);
  }
}

// Every agent: their calendar link, a viewing as a calendar file, and a
// lead's Calendly booking link.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerCalendarController {
  constructor(
    private readonly feeds: CalendarFeedService,
    private readonly calendly: CalendlyService,
  ) {}

  @Get('calendar-feed')
  feed(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    return this.feeds.mine(tenantId, viewerOf(user).id);
  }

  @Post('calendar-feed/rotate')
  @HttpCode(200)
  rotate(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    return this.feeds.rotate(tenantId, viewerOf(user).id);
  }

  @Get('viewings/:vid/ics')
  async viewingIcs(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('vid', ParseIntPipe) vid: number, @Res() res: Response) {
    sendIcs(res, await this.feeds.one(tenantId, viewerOf(user), vid), `viewing-${vid}.ics`);
  }

  @Get(':id/booking-link')
  bookingLink(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.calendly.linkFor(tenantId, viewerOf(user), id);
  }
}

// Calendly's webhook: the secret token in the path picks the agency, the
// signature proves it came from Calendly.
@Controller('api/webhooks/calendly')
@Public()
export class CalendlyWebhookController {
  constructor(private readonly calendly: CalendlyService) {}

  @Post(':token')
  @HttpCode(200)
  receive(@Param('token') token: string, @Headers('calendly-webhook-signature') signature: string | undefined, @Req() req: Request) {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    return this.calendly.handleWebhook(token, signature, raw ? raw.toString('utf8') : '', req.body);
  }
}

// The agent's subscribed calendar (no login: calendar apps can't log in).
@Controller('api/calendar')
@Public()
export class CalendarFeedController {
  constructor(private readonly feeds: CalendarFeedService) {}

  @Get(':file')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async ics(@Param('file') file: string, @Res() res: Response) {
    const token = /^([0-9a-f]{48})\.ics$/.exec(file)?.[1];
    const ics = token ? await this.feeds.feed(token) : null;
    if (!ics) {
      res.status(404).end();
      return;
    }
    sendIcs(res, ics, 'viewings.ics');
  }
}
