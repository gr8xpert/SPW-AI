import { Body, Controller, Get, Headers, HttpCode, HttpStatus, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, Public, RequiresAddon } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { BuyerPageService, type FeedbackAction, type PageAction } from './buyer-page.service';
import { buildBuyerPageHtml } from './buyer-page-html';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PageActionDto {
  @IsIn(['create', 'enable', 'disable', 'renew'])
  action: PageAction;
}

export class PageFeedbackDto {
  @Type(() => Number) @IsInt() @Min(1)
  propertyId: number;

  @IsIn(['like', 'reject', 'clear', 'viewing'])
  action: FeedbackAction;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  reason?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  message?: string;
}

export class PageViewQueryDto {
  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;
}

function noIndex(res: Response): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

// The agent's side: the buyer's private link, switched on/off or replaced.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerPageController {
  constructor(private readonly pages: BuyerPageService) {}

  @Get(':id/page')
  status(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.pages.status(tenantId, viewerOf(user), id);
  }

  @Post(':id/page')
  @HttpCode(HttpStatus.OK)
  act(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: PageActionDto) {
    return this.pages.act(tenantId, viewerOf(user), id, dto.action);
  }
}

// The buyer's side, for the website block (data-spm-widget="buyer-page").
// Public: the code in the link is the key. No add-on check, so links in
// emails keep working.
@Controller('api/v1/buyer-page')
export class PublicBuyerPageController {
  constructor(private readonly pages: BuyerPageService) {}

  @Public()
  @Get(':code')
  async view(
    @Param('code') code: string,
    @Query() q: PageViewQueryDto,
    @Headers('x-api-key') apiKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noIndex(res);
    const { labels: _labels, ...view } = await this.pages.view(code, q.lang, apiKey || undefined);
    return view;
  }

  @Public()
  @Post(':code/feedback')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async feedback(
    @Param('code') code: string,
    @Body() dto: PageFeedbackDto,
    @Headers('x-api-key') apiKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noIndex(res);
    return this.pages.feedback(code, dto, apiKey || undefined);
  }
}

// The SPM fallback page, until the agency's own site has one:
// <API_URL>/p/<code>, in the buyer's language, with the agency's branding.
@Controller('p')
export class BuyerPageFallbackController {
  constructor(
    private readonly pages: BuyerPageService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get(':code')
  async page(@Param('code') code: string, @Query() q: PageViewQueryDto, @Res() res: Response): Promise<void> {
    noIndex(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const api = (this.config.get<string>('API_URL') || 'http://localhost:3001').replace(/\/+$/, '');
    try {
      const { labels, ...view } = await this.pages.view(code, q.lang);
      res.status(200).end(buildBuyerPageHtml(view, { labels, feedbackUrl: `${api}/api/v1/buyer-page/${encodeURIComponent(code)}/feedback` }));
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      res.status(404).end(buildBuyerPageHtml(null, { labels: {}, feedbackUrl: '' }));
    }
  }
}
