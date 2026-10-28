import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { Public } from '../../common/decorators';
import { TenantService } from '../tenant/tenant.service';
import { WebhookService } from '../webhook/webhook.service';
import { LeadService } from './lead.service';
import { FormMailService } from './form-mail.service';
import { InquiryDto, ShareFavoritesDto } from './dto';
import { BuyerIntakeService } from './buyer/buyer-intake.service';
import { language, requireRecaptcha, widgetTenant } from './website-form-guard';
import { AnalyticsService } from '../analytics/analytics.service';

// The forms on a client's website. Write-heavy and abuse-prone, so rate
// limits are per tenant API key (ApiKeyThrottlerGuard) with a tight per-key
// ceiling — 30 a minute is plenty for real visitors and curbs CRM spam.

// Same email + same property within this window = a double click or a
// refresh: answer with the first lead, send nothing again.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

@Controller('api/v1/inquiry')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class InquiryController {
  private readonly logger = new Logger(InquiryController.name);

  constructor(
    private readonly leadService: LeadService,
    private readonly intake: BuyerIntakeService,
    private readonly tenantService: TenantService,
    private readonly formMail: FormMailService,
    private readonly webhookService: WebhookService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Public()
  @Post()
  async createInquiry(
    @Headers('x-api-key') apiKey: string,
    @Headers('origin') origin: string | undefined,
    @Body() dto: InquiryDto,
  ) {
    const tenant = await widgetTenant(this.tenantService, apiKey);
    await requireRecaptcha(tenant, dto.recaptchaToken);

    // Only this client's own listing: a property deleted since the page
    // loaded (or another client's id) used to fail the whole inquiry.
    const property = await this.formMail.ownProperty(tenant.id, dto.propertyId);
    const propertyId = property?.id;

    const existing = await this.leadService.findRecentDuplicateInquiry(tenant.id, dto.email, propertyId ?? null, DEDUPE_WINDOW_MS);
    if (existing) {
      this.logger.log(`Inquiry dedup tenant=${tenant.id} property=${propertyId ?? 'null'} → lead ${existing.id}`);
      // Same answer as a new inquiry: never hand a stored lead (someone's
      // name, phone, notes) to a caller who only knows an email address.
      return { success: true };
    }

    // The buyer with this email (or a new one, given an agent), with a
    // wishlist guessed from the property unless an agent already set one.
    const { lead } = await this.intake.upsertFromWebsite(tenant.id, {
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      message: dto.message,
      propertyIds: propertyId ? [propertyId] : [],
      source: 'widget_inquiry',
      kind: 'enquiry',
      pageUrl: dto.pageUrl,
    });

    this.leadService
      .markWebsiteKey(lead.id, tenant.apiKeyId)
      .catch((err) => this.logger.warn(`Lead website key not saved: ${(err as Error).message}`));

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

    return { success: true };
  }
}

// Wishlist "Email your wishlist": the list goes to the address the visitor
// gave, from the client; the agency gets a lead when the visitor left theirs.
// Wishlist emails a client's site may send per day (per API worker).
const WISHLIST_EMAILS_PER_DAY = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

@Controller('api/v1/share-favorites')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class ShareFavoritesController {
  private readonly logger = new Logger(ShareFavoritesController.name);
  // recipient → last send, so a double click or a hostile loop can't flood
  // one inbox from the client's name. Per API worker; the window is short.
  private readonly recentRecipients = new Map<string, number>();
  // tenant → send times in the last day: the form is public, so a script
  // could otherwise mail any address list in the client's name. Per worker.
  private readonly tenantSends = new Map<number, number[]>();

  constructor(
    private readonly leadService: LeadService,
    private readonly intake: BuyerIntakeService,
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
    await requireRecaptcha(tenant, dto.recaptchaToken);
    const key = `${tenant.id}|${dto.recipientEmail.toLowerCase()}`;
    const now = Date.now();
    for (const [k, at] of this.recentRecipients) if (at < now - DEDUPE_WINDOW_MS) this.recentRecipients.delete(k);
    if (this.recentRecipients.has(key)) {
      return { success: true, message: 'Wishlist already sent' };
    }
    const sends = (this.tenantSends.get(tenant.id) ?? []).filter((at) => at > now - DAY_MS);
    if (sends.length >= WISHLIST_EMAILS_PER_DAY) {
      this.logger.warn(`Wishlist email cap reached for tenant=${tenant.id}`);
      throw new HttpException('Too many wishlist emails today, please try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.tenantSends.set(tenant.id, [...sends, now]);
    this.recentRecipients.set(key, now);

    const refs = await this.formMail.wishlist(tenant, dto, origin, language(acceptLanguage));
    if (!refs.length) {
      this.recentRecipients.delete(key);
      throw new BadRequestException('None of these properties is available any more');
    }

    if (dto.senderEmail) {
      const existing = await this.leadService.findRecentDuplicateInquiry(tenant.id, dto.senderEmail, null, DEDUPE_WINDOW_MS);
      if (!existing) {
        // The visitor is a buyer too, and their favourites say what they like
        // (the references and the recipient go in the activity).
        await this.intake
          .upsertFromWebsite(tenant.id, {
            email: dto.senderEmail,
            name: dto.senderName,
            message: dto.message?.trim() || undefined,
            propertyIds: dto.items.map((i) => i.id),
            source: 'website',
            kind: 'favorites',
            recipient: dto.recipientEmail,
          })
          .catch((err) => this.logger.warn(`Wishlist buyer failed: ${(err as Error).message}`));
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
