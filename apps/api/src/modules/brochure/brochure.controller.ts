import {
  Controller,
  Get,
  Param,
  Query,
  Headers,
  Res,
  UnauthorizedException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BrochureService } from './brochure.service';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/v1/properties')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class BrochureController {
  constructor(
    private readonly brochureService: BrochureService,
    private readonly tenantService: TenantService,
  ) {}

  // Public PDF endpoint. API key can come from header (preferred) OR `?apiKey=`
  // query (needed when the widget triggers a download via `window.open()` —
  // browser anchor/window.open requests can't set custom headers).
  @Public()
  @Get(':reference/brochure.pdf')
  async download(
    @Param('reference') reference: string,
    @Headers('x-api-key') headerKey: string | undefined,
    @Query('apiKey') queryKey: string | undefined,
    @Query('lang') langRaw: string | undefined,
    @Query('variant') variantRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const apiKey = headerKey || queryKey;
    if (!apiKey) throw new UnauthorizedException('API key required');

    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');

    const lang = (langRaw && /^[a-z]{2,5}$/i.test(langRaw) ? langRaw.toLowerCase() : 'en');
    const variantOverride =
      variantRaw === 'branded' || variantRaw === 'unbranded' ? variantRaw : undefined;

    const { pdf, filename } = await this.brochureService.renderBrochure({
      tenantId: tenant.id,
      reference,
      lang,
      variantOverride,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }
}
