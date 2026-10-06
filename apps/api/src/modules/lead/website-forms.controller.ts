import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { TenantSettings } from '@spm/shared';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { Public } from '../../common/decorators';
import { Tenant } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { WebhookService } from '../webhook/webhook.service';
import { LeadService } from './lead.service';
import { FormMailService } from './form-mail.service';
import { InquiryDto, ShareFavoritesDto } from './dto';
import { isRecaptchaKey } from '../../common/security/recaptcha-key';
import { AnalyticsService } from '../analytics/analytics.service';

// The forms on a client's website. Write-heavy and abuse-prone, so rate
// limits are per tenant API key (ApiKeyThrottlerGuard) with a tight per-key
// ceiling — 30 a minute is plenty for real visitors and curbs CRM spam.

// Same email + same property within this window = a double click or a
// refresh: answer with the first lead, send nothing again.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

async function widgetTenant(tenantService: TenantService, apiKey: string): Promise<Tenant> {
  if (!apiKey) throw new UnauthorizedException('API key required');
  const tenant = await tenantService.findActiveWidgetTenantByApiKey(apiKey);
  if (!tenant) throw new UnauthorizedException('Invalid API key');
  return tenant;
}

function language(acceptLanguage?: string): string {
  const tag = (acceptLanguage || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(tag) ? tag : 'en';
}

@Controller('api/v1/inquiry')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class InquiryController {
  private readonly logger = new Logger(InquiryController.name);

  constructor(
    private readonly leadService: LeadService,
    private readonly tenantService: TenantService,
    private readonly formMail: FormMailService,
    private readonly webhookService: WebhookService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async verifyRecaptcha(secretKey: string, token: string): Promise<boolean> {
    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }

  @Public()
  @Post()
  async createInquiry(
    @Headers('x-api-key') apiKey: string,
    @Headers('origin') origin: string | undefined,
    @Body() dto: InquiryDto,
  ) {
    const tenant = await widgetTenant(this.tenantService, apiKey);
    const settings = (tenant.settings || {}) as TenantSettings;
    // Encrypted column is authoritative; settings.recaptchaSecretKey is a
    // pre-migration legacy fallback.
    // Only a real key pair turns the captcha on — the same rule decides
    // whether the widget shows the box (getPublicWidgetConfig), so a
    // malformed key can never demand a token the form couldn't get.
    const secretKey = tenant.recaptchaSecretKey || settings.recaptchaSecretKey;
    if (isRecaptchaKey(secretKey) && isRecaptchaKey(settings.recaptchaSiteKey)) {
      if (!dto.recaptchaToken) throw new BadRequestException('reCAPTCHA verification required');
      if (!(await this.verifyRecaptcha(secretKey, dto.recaptchaToken))) {
        throw new BadRequestException('reCAPTCHA verification failed');
      }
    }

    // Only this client's own listing: a property deleted since the page
    // loaded (or another client's id) used to fail the whole inquiry.
    const property = await this.formMail.ownProperty(tenant.id, dto.propertyId);
    const propertyId = property?.id;

    const existing = await this.leadService.findRecentDuplicateInquiry(tenant.id, dto.email, propertyId ?? null, DEDUPE_WINDOW_MS);
    if (existing) {
      this.logger.log(`Inquiry dedup tenant=${tenant.id} property=${propertyId ?? 'null'} → lead ${existing.id}`);
      return existing;
    }

    const lead = await this.leadService.create(tenant.id, 0, {
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      message: dto.message,
      propertyId,
      source: 'widget_inquiry',
    });

    // Analytics → Inquiries (and the property's row in Property Analytics).
    if (propertyId && dto.sessionId) {
      this.analytics
        .markInquiry(tenant.id, propertyId, dto.sessionId)
        .catch((err) => this.logger.warn(`Inquiry analytics failed: ${(err as Error).message}`));
    }

    // Fire-and-forget: the visitor's "thank you" doesn't wait on mail or webhooks.
    this.formMail
      .inquiry(tenant, dto, lead.id, property, origin)
      .catch((err) => this.logger.error(`Inquiry emails failed for lead ${lead.id}: ${(err as Error).message}`));

    const payload = {
      event: 'lead.created',
      leadId: lead.id,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      message: dto.message,
      propertyId,
      propertyReference: property?.reference ?? dto.propertyReference,
      source: 'widget_inquiry',
      createdAt: new Date().toISOString(),
    };
    // Main webhook and the dedicated inquiry webhook: both signed, audited and
    // retried by WebhookService ("no URL configured" is recorded as skipped).
    this.webhookService.emit(tenant.id, 'lead.created', payload).catch((err) =>
      this.logger.warn(`Main webhook emit failed: ${err.message}`),
    );
    this.webhookService.emit(tenant.id, 'lead.created', payload, { channel: 'inquiry' }).catch((err) =>
      this.logger.warn(`Inquiry webhook emit failed: ${err.message}`),
    );

    return lead;
  }
}

// Wishlist "Email your wishlist": the list goes to the address the visitor
// gave, from the client; the agency gets a lead when the visitor left theirs.
@Controller('api/v1/share-favorites')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class ShareFavoritesController {
  private readonly logger = new Logger(ShareFavoritesController.name);
  // recipient → last send, so a double click or a hostile loop can't flood
  // one inbox from the client's name. Per API worker; the window is short.
  private readonly recentRecipients = new Map<string, number>();

  constructor(
    private readonly leadService: LeadService,
    private readonly tenantService: TenantService,
    private readonly formMail: FormMailService,
  ) {}

  @Public()
  @Post()
  async shareFavorites(
    @Headers('x-api-key') apiKey: string,
    @Headers('origin') origin: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Body() dto: ShareFavoritesDto,
  ) {
    const tenant = await widgetTenant(this.tenantService, apiKey);
    const key = `${tenant.id}|${dto.recipientEmail.toLowerCase()}`;
    const now = Date.now();
    for (const [k, at] of this.recentRecipients) if (at < now - DEDUPE_WINDOW_MS) this.recentRecipients.delete(k);
    if (this.recentRecipients.has(key)) {
      return { success: true, message: 'Wishlist already sent' };
    }
    this.recentRecipients.set(key, now);

    const refs = await this.formMail.wishlist(tenant, dto, origin, language(acceptLanguage));
    if (!refs.length) {
      this.recentRecipients.delete(key);
      throw new BadRequestException('None of these properties is available any more');
    }

    if (dto.senderEmail) {
      const existing = await this.leadService.findRecentDuplicateInquiry(tenant.id, dto.senderEmail, null, DEDUPE_WINDOW_MS);
      if (!existing) {
        await this.leadService
          .create(tenant.id, 0, {
            email: dto.senderEmail,
            name: dto.senderName,
            message: `Emailed their wishlist to ${dto.recipientEmail}: ${refs.join(', ')}${dto.message?.trim() ? `\n\n${dto.message.trim()}` : ''}`,
            source: 'website',
          })
          .catch((err) => this.logger.warn(`Wishlist lead failed: ${(err as Error).message}`));
      }
    }

    return { success: true, message: 'Wishlist sent' };
  }
}

// The visitor's country, for the phone code on the inquiry form. Cloudflare
// adds it to every request from its IP lookup (CF-IPCountry); nothing is
// stored. Unknown ("XX", Tor "T1", no Cloudflare locally) → null.
@Controller('api/v1/visitor-country')
export class VisitorCountryController {
  @Public()
  @Get()
  @Header('Cache-Control', 'private, no-store')
  country(@Headers('cf-ipcountry') cf?: string) {
    const code = (cf || '').trim().toUpperCase();
    return { country: /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null };
  }
}
